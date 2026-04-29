import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';

const POLL_INTERVAL_MS = 15_000;

@Injectable()
export class PaymentPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentPollingService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.pollPendingSessions(), POLL_INTERVAL_MS);
    this.logger.log('Background payment polling started (interval: 15s).');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollPendingSessions(): Promise<void> {
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken) return;

    let sessionsSnap: FirebaseFirestore.QuerySnapshot;
    try {
      sessionsSnap = await this.firebaseService.db.collection('sessions').get();
    } catch {
      return;
    }

    if (sessionsSnap.empty) return;

    for (const doc of sessionsSnap.docs) {
      const orderId = doc.id;
      const session = doc.data() as { expiresAt: number };

      if (session.expiresAt < Date.now()) {
        await doc.ref.delete();
        continue;
      }

      try {
        await this.checkAndConfirmPayment(orderId, mpToken, doc.ref);
      } catch (err) {
        this.logger.warn(`[polling] Erro ao verificar pedido ${orderId}: ${(err as Error).message}`);
      }
    }
  }

  private async checkAndConfirmPayment(
    orderId: string,
    mpToken: string,
    sessionRef: FirebaseFirestore.DocumentReference,
  ): Promise<void> {
    const searchRes = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=1`,
      { headers: { Authorization: `Bearer ${mpToken}` } },
    );

    if (!searchRes.ok) return;

    const { results = [] } = (await searchRes.json()) as { results: any[] };
    if (results.length === 0) return;

    const payment = results[0];
    if (payment.status !== 'approved') return;

    const order = await this.ordersService.findById(orderId);
    if (order.status === 'PAID') {
      await sessionRef.delete();
      return;
    }

    const paidAmount: number = payment.transaction_amount ?? 0;
    const expectedTotal: number = order.total ?? 0;
    const TOLERANCE = 0.01;

    if (paidAmount < expectedTotal - TOLERANCE) {
      this.logger.error(
        `SECURITY ALERT [bg-polling]: payment ${payment.id} pago R$${paidAmount} < pedido ${orderId} total R$${expectedTotal}. Pedido NÃO marcado como PAID.`,
      );
      await this.firebaseService.db.collection('audit_logs').add({
        entityType: 'order',
        entityId: orderId,
        action: 'payment_amount_mismatch',
        actorId: 'background_polling',
        payload: { paymentId: payment.id, paidAmount, expectedTotal, status: payment.status },
        createdAt: Date.now(),
      });
      return;
    }

    await sessionRef.delete();
    await this.ordersService.updatePaymentInfo(orderId, String(payment.id), payment.preference_id || '', payment.transaction_amount);
    await this.ordersService.updateStatus(orderId, 'PAID', 'background_polling');

    this.logger.log(`[bg-polling] Pedido ${orderId} marcado como PAID via background polling.`);

    if (order.customerPhone && order.orderNumber) {
      void this.notificationsService.sendOrderPaidWhatsApp(
        order.customerPhone,
        order.orderNumber,
        order.customerName || '',
        order.customerAddress || '',
      );
    }
  }
}
