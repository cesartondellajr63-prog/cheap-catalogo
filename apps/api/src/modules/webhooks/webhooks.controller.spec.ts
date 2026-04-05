import * as crypto from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'segredo-webhook-teste';

function makeFirebase(idempotencyEmpty = true) {
  return {
    db: {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: idempotencyEmpty, docs: [{ ref: { update: jest.fn() } }] }),
        add: jest.fn().mockResolvedValue({ id: 'log-id' }),
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING', id: 'order-id' }) }),
        }),
      }),
    },
  } as any;
}

function makeOrdersService() {
  return {
    updatePaymentInfo: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    findByOrderNumber: jest.fn().mockResolvedValue({ id: 'order-id', status: 'PENDING' }),
  } as any;
}

function makeApprovedPayment(orderId = 'order-id') {
  return {
    id: 'pay-123',
    status: 'approved',
    external_reference: orderId,
    transaction_amount: 89.9,
    preference_id: 'pref-1',
    metadata: { customer_phone: '11999999999', customer_name: 'João Silva' },
    payer: { email: 'joao@teste.com', phone: { number: '999999999' } },
  };
}

function buildSignature(paymentId: string, requestId = '', ts = String(Date.now())) {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return { signatureHeader: `ts=${ts},v1=${hash}`, ts };
}

function makeReq(headers: Record<string, string> = {}) {
  return { headers };
}

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp-token';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  });

  // ── mercadopago ─────────────────────────────────────────────────────────────

  describe('handleMercadoPago', () => {
    it('deve ignorar eventos que não são payment e retornar received: true', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      const result = await controller.handleMercadoPago(
        { type: 'merchant_order' },
        makeReq(),
        {},
      );

      expect(result).toEqual({ received: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deve retornar received: true quando não há paymentId', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      const result = await controller.handleMercadoPago(
        { type: 'payment', data: {} },
        makeReq(),
        {},
      );

      expect(result).toEqual({ received: true });
    });

    it('deve lançar ForbiddenException para assinatura HMAC inválida', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      await expect(
        controller.handleMercadoPago(
          { type: 'payment', data: { id: 'pay-123' } },
          makeReq({ 'x-signature': 'ts=123,v1=assinatura-invalida', 'x-request-id': '' }),
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve processar pagamento aprovado e atualizar status para PAID', async () => {
      const ordersService = makeOrdersService();
      controller = new WebhooksController(makeFirebase(true), ordersService);

      const { signatureHeader } = buildSignature('pay-123');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => makeApprovedPayment('order-id'),
      });

      const result = await controller.handleMercadoPago(
        { type: 'payment', data: { id: 'pay-123' } },
        makeReq({ 'x-signature': signatureHeader, 'x-request-id': '' }),
        {},
      );

      expect(result).toEqual({ received: true });
      expect(ordersService.updateStatus).toHaveBeenCalledWith('order-id', 'PAID', 'webhook_mercadopago');
    });

    it('deve ignorar pagamento já processado (idempotência)', async () => {
      const ordersService = makeOrdersService();
      // idempotencyEmpty = false → já existe pedido com esse paymentId
      controller = new WebhooksController(makeFirebase(false), ordersService);

      const { signatureHeader } = buildSignature('pay-123');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => makeApprovedPayment('order-id'),
      });

      await controller.handleMercadoPago(
        { type: 'payment', data: { id: 'pay-123' } },
        makeReq({ 'x-signature': signatureHeader, 'x-request-id': '' }),
        {},
      );

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('deve registrar audit_log após pagamento aprovado', async () => {
      const firebase = makeFirebase(true);
      const addSpy = jest.spyOn(firebase.db.collection('audit_logs'), 'add');
      controller = new WebhooksController(firebase, makeOrdersService());

      const { signatureHeader } = buildSignature('pay-123');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => makeApprovedPayment('order-id'),
      });

      await controller.handleMercadoPago(
        { type: 'payment', data: { id: 'pay-123' } },
        makeReq({ 'x-signature': signatureHeader, 'x-request-id': '' }),
        {},
      );

      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payment_approved', entityType: 'order' }),
      );
    });

    it('deve lançar erro na inicialização se WEBHOOK_SECRET não estiver configurado', () => {
      delete process.env.WEBHOOK_SECRET;
      expect(() => new WebhooksController(makeFirebase(), makeOrdersService())).toThrow(
        'WEBHOOK_SECRET environment variable is required.',
      );
    });
  });

  // ── cielo ───────────────────────────────────────────────────────────────────

  describe('handleCielo', () => {
    it('deve retornar received: true sem merchant_order_number', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      const result = await controller.handleCielo({ body: {} });
      expect(result).toEqual({ received: true });
    });

    it('deve marcar pedido como PAID para order_status 4', async () => {
      const ordersService = makeOrdersService();
      controller = new WebhooksController(makeFirebase(), ordersService);

      const result = await controller.handleCielo({
        body: { order_status: '4', order_number: 'CP-12345678' },
      });

      expect(result).toEqual({ received: true });
      expect(ordersService.updateStatus).toHaveBeenCalledWith('order-id', 'PAID', 'webhook_cielo');
    });

    it('deve ignorar pedido já marcado como PAID', async () => {
      const ordersService = makeOrdersService();
      ordersService.findByOrderNumber = jest.fn().mockResolvedValue({ id: 'order-id', status: 'PAID' });
      controller = new WebhooksController(makeFirebase(), ordersService);

      await controller.handleCielo({
        body: { order_status: '4', order_number: 'CP-12345678' },
      });

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });
  });
});
