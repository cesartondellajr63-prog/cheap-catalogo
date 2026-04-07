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
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { OrdersService } from '../orders/orders.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly ordersService: OrdersService,
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

    // Cross-check the transferred amount against the order total stored in the
    // database. This prevents the "R$0.01 Pix" attack where an attacker sends
    // an approved payment with an arbitrary external_reference but for a
    // fraction of the actual order value.
    const order = await this.ordersService.findById(orderId);
    const valorRecebido = Number(payment.transaction_amount);
    const valorEsperado = Number(order.total);

    if (valorRecebido < valorEsperado) {
      this.logger.error(
        `[FRAUD] Order ${orderId}: R$${valorRecebido} recebido, R$${valorEsperado} esperado — pedido NÃO liberado.`,
      );
      throw new BadRequestException('Valor recebido insuficiente para cobrir o pedido.');
    }

    await this.ordersService.updatePaymentInfo(orderId, String(payment.id), payment.preference_id || '');
    await this.ordersService.updateStatus(orderId, 'PAID', 'webhook_mercadopago');

    const metadata = payment.metadata || {};
    const customerPhone = metadata.customer_phone || payment.payer?.phone?.number || '';
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

    // Cielo's webhook notification only tells us "something changed" — it does
    // not carry a signature we can verify. The only safe approach is to fetch
    // the payment directly from Cielo's API using the PaymentId they provide,
    // and trust only that authoritative response (same pattern as MercadoPago).
    const cieloPaymentId: string = body?.PaymentId || body?.payment_id || '';

    if (!cieloPaymentId) {
      this.logger.warn(`Cielo webhook missing PaymentId for order ${merchantOrderNumber}`);
      throw new BadRequestException('PaymentId ausente no webhook da Cielo.');
    }

    const merchantId = process.env.CIELO_MERCHANT_ID;
    const merchantKey = process.env.CIELO_MERCHANT_KEY;

    const cieloResponse = await fetch(
      `https://apiquery.cieloecommerce.cielo.com.br/1/sales/${cieloPaymentId}`,
      {
        headers: {
          MerchantId: merchantId as string,
          MerchantKey: merchantKey as string,
        },
      },
    );

    if (!cieloResponse.ok) {
      this.logger.error(`Failed to verify Cielo payment ${cieloPaymentId} from Cielo API`);
      throw new InternalServerErrorException('Falha ao verificar pagamento na Cielo.');
    }

    const cieloPayment = (await cieloResponse.json()) as any;
    // Cielo status: 1 = Authorized, 2 = PaymentConfirmed
    const cieloStatus: number = cieloPayment?.Payment?.Status;
    const cieloAmount: number = cieloPayment?.Payment?.Amount; // centavos

    if (cieloStatus !== 1 && cieloStatus !== 2) {
      this.logger.log(`Cielo payment ${cieloPaymentId} status: ${cieloStatus}, no action.`);
      return { received: true };
    }

    try {
      const order = await this.ordersService.findByOrderNumber(merchantOrderNumber);
      if (order.status === 'PAID') {
        this.logger.log(`Order ${order.id} already PAID, skipping.`);
        return { received: true };
      }

      // Fail-secure amount validation: NaN, missing, or partial amounts are all
      // rejected. isNaN catches "hack", undefined, and other non-numeric values.
      const valorEsperadoEmCentavos = Math.round(order.total * 100);
      if (!cieloAmount || isNaN(cieloAmount) || cieloAmount < valorEsperadoEmCentavos) {
        this.logger.error(
          `[FRAUD] Cielo order ${merchantOrderNumber}: ${cieloAmount} centavos recebidos, ${valorEsperadoEmCentavos} esperados — pedido NÃO liberado.`,
        );
        throw new BadRequestException('Bypass detectado ou valor insuficiente.');
      }

      await this.ordersService.updateStatus(order.id, 'PAID', 'webhook_cielo');
      this.logger.log(`Order ${order.id} marked as PAID via Cielo payment ${cieloPaymentId}.`);
    } catch (e) {
      // Re-throw intentional rejections (fraud detection, not-found, etc.)
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`Cielo webhook error: ${(e as Error).message}`);
    }

    return { received: true };
  }
}
