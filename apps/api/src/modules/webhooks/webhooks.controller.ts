import * as crypto from 'crypto';
import {
  Controller,
  Post,
  Body,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('WEBHOOK_SECRET environment variable is required.');
    }
    this.webhookSecret = secret;
  }

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async handleMercadoPago(
    @Body() body: any,
    @Req() req: any,
    @Query() query: Record<string, string>,
  ): Promise<{ received: boolean }> {
    const type = body?.type || body?.topic || query['type'];

    if (type !== 'payment') {
      this.logger.log(`Ignoring webhook type: ${type}`);
      return { received: true };
    }

    const paymentId: string = body?.data?.id || query['data.id'];

    if (!paymentId) {
      this.logger.warn('Webhook received without paymentId');
      return { received: true };
    }

    const signatureHeader = req.headers['x-signature'] as string;
    const requestId = req.headers['x-request-id'] as string;

    if (!signatureHeader) {
      this.logger.warn(`Webhook sem x-signature recebido para paymentId ${paymentId}`);
      throw new UnauthorizedException('Missing webhook signature.');
    }

    const parts = signatureHeader.split(',');
    let ts = '';
    let hash = '';

    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 'ts') ts = value;
      if (key === 'v1') hash = value;
    }

    if (!ts || !hash) {
      this.logger.warn(`Webhook com x-signature malformado para paymentId ${paymentId}`);
      throw new UnauthorizedException('Malformed webhook signature.');
    }

    // Validação de timestamp para prevenir Replay Attacks (tolerância de 5 minutos)
    // O MercadoPago envia ts em SEGUNDOS — converter para ms antes de comparar
    const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const tsMs = Number(ts) * 1000;
    if (now - tsMs > TIMESTAMP_TOLERANCE_MS) {
      this.logger.warn(`Webhook expirado para paymentId ${paymentId}. TS: ${ts}, Now: ${now}`);
      throw new UnauthorizedException('Webhook timestamp expired (Replay Attack protection).');
    }

    const manifest = `id:${paymentId};request-id:${requestId || ''};ts:${ts};`;
    const expectedHmac = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(manifest)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedHmac, 'hex'), Buffer.from(hash, 'hex'))) {
      this.logger.warn(`Webhook signature inválida para paymentId ${paymentId}`);
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${mpToken}`,
        },
      },
    );

    if (!paymentResponse.ok) {
      this.logger.error(`Failed to fetch payment ${paymentId} from MercadoPago`);
      throw new InternalServerErrorException('Failed to fetch payment details.');
    }

    const payment = (await paymentResponse.json()) as any;

    if (payment.status !== 'approved') {
      this.logger.log(`Payment ${paymentId} status: ${payment.status}, no action taken.`);
      return { received: true };
    }

    const idempotencyCheck = await this.firebaseService.db
      .collection('orders')
      .where('mpPaymentId', '==', String(payment.id))
      .limit(1)
      .get();

    if (!idempotencyCheck.empty) {
      this.logger.log(`Payment ${paymentId} already processed (idempotency check).`);
      return { received: true };
    }

    const orderId: string = payment.external_reference;

    if (!orderId) {
      this.logger.warn(`Payment ${paymentId} has no external_reference.`);
      return { received: true };
    }

    // SECURITY: valida que o valor pago pelo Mercado Pago bate com o total do pedido
    let order: any;
    try {
      order = await this.ordersService.findById(orderId);
    } catch {
      this.logger.error(`Webhook: pedido ${orderId} não encontrado para validação de valor.`);
      return { received: true };
    }

    const paidAmount: number = payment.transaction_amount ?? 0;
    const expectedTotal: number = order.total ?? 0;
    const TOLERANCE = 0.01; // tolerância de R$ 0,01 para arredondamentos

    if (paidAmount < expectedTotal - TOLERANCE) {
      this.logger.error(
        `SECURITY ALERT [webhook]: payment ${paymentId} pago R$${paidAmount} < pedido ${orderId} total R$${expectedTotal}. Pedido NÃO marcado como PAID.`,
      );
      await this.firebaseService.db.collection('audit_logs').add({
        entityType: 'order',
        entityId: orderId,
        action: 'payment_amount_mismatch',
        actorId: 'webhook_mercadopago',
        payload: {
          paymentId: payment.id,
          paidAmount,
          expectedTotal,
          status: payment.status,
        },
        createdAt: Date.now(),
      });
      return { received: true };
    }

    await this.ordersService.updatePaymentInfo(orderId, String(payment.id), payment.preference_id || '', payment.transaction_amount);
    await this.ordersService.updateStatus(orderId, 'PAID', 'webhook_mercadopago');

    const metadata = payment.metadata || {};
    const customerPhone =
      order.customerPhone ||
      metadata.customer_phone ||
      payment.payer?.phone?.number ||
      '';

    this.logger.log(`[WHATSAPP] phone=${customerPhone} orderNumber=${order.orderNumber}`);

    if (customerPhone && order.orderNumber) {
      void this.notificationsService.sendOrderPaidWhatsApp(customerPhone, order.orderNumber);
    }
    const customerName =
      metadata.customer_name ||
      `${payment.payer?.first_name || ''} ${payment.payer?.last_name || ''}`.trim();
    const customerEmail = payment.payer?.email || '';
    const customerAddress = metadata.customer_address || '';

    if (customerPhone) {
      const customersRef = this.firebaseService.db.collection('customers');
      const existingQuery = await customersRef
        .where('phone', '==', customerPhone)
        .limit(1)
        .get();

      const now = Date.now();

      if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const updates: Record<string, any> = { updatedAt: now };
        if (customerName) updates.name = customerName;
        if (customerAddress) updates.address = customerAddress;
        await existingDoc.ref.update(updates);
      } else {
        await customersRef.add({
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await this.firebaseService.db.collection('audit_logs').add({
      entityType: 'order',
      entityId: orderId,
      action: 'payment_approved',
      actorId: 'webhook_mercadopago',
      payload: {
        paymentId: payment.id,
        amount: payment.transaction_amount,
        status: payment.status,
      },
      createdAt: Date.now(),
    });

    this.logger.log(`Order ${orderId} marked as PAID via payment ${paymentId}.`);
    return { received: true };
  }

  @Post('cielo')
  @HttpCode(HttpStatus.OK)
  async handleCielo(@Req() req: any): Promise<{ received: boolean }> {
    const body = req.body;

    this.logger.log(`Cielo webhook received — content-type: ${req.headers['content-type']} body: ${JSON.stringify(body)}`);

    // Cielo envia form-urlencoded — todos os valores chegam como string
    const orderStatus = Number(body?.order_status ?? body?.OrderStatus ?? 0);
    const paymentStatus = Number(body?.payment_status ?? body?.PaymentStatus ?? body?.paymentstatus ?? 0);
    const merchantOrderNumber: string =
      body?.order_number || body?.merchant_order_number || body?.MerchantOrderNumber || '';

    this.logger.log(`Cielo parsed — orderStatus: ${orderStatus}, paymentStatus: ${paymentStatus}, orderNumber: ${merchantOrderNumber}`);

    if (!merchantOrderNumber) {
      this.logger.warn('Cielo webhook missing merchant_order_number');
      return { received: true };
    }

    // order_status 4 = Complete | payment_status 1 = Authorized, 2 = PaymentConfirmed
    const isPaid = orderStatus === 4 || paymentStatus === 1 || paymentStatus === 2;

    if (!isPaid) {
      this.logger.log(`Cielo webhook order ${merchantOrderNumber}: not paid yet (${orderStatus}/${paymentStatus}), no action.`);
      return { received: true };
    }

    try {
      const order = await this.ordersService.findByOrderNumber(merchantOrderNumber);
      if (order.status === 'PAID') {
        this.logger.log(`Order ${order.id} already PAID, skipping.`);
        return { received: true };
      }
      await this.ordersService.updateStatus(order.id, 'PAID', 'webhook_cielo');
      const amountCents = Number(body?.amount ?? body?.Amount ?? 0);
      if (amountCents > 0) {
        await this.ordersService.updatePaidAmount(order.id, amountCents / 100);
      }
      this.logger.log(`Order ${order.id} marked as PAID via Cielo webhook.`);

      const phone = order.customerPhone || order.customer?.phone || '';
      if (phone && order.orderNumber) {
        void this.notificationsService.sendOrderPaidWhatsApp(phone, order.orderNumber);
      }
    } catch (e) {
      this.logger.error(`Cielo webhook error: ${(e as Error).message}`);
    }

    return { received: true };
  }
}
