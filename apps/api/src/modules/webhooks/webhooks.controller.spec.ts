import * as crypto from 'crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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

function makeOrdersService(orderTotal = 89.9) {
  return {
    updatePaymentInfo: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({ id: 'order-id', status: 'PENDING', total: orderTotal }),
    findByOrderNumber: jest.fn().mockResolvedValue({ id: 'order-id', status: 'PENDING', total: orderTotal }),
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

    it('deve lançar UnauthorizedException para assinatura HMAC inválida', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      // Must be 64 valid hex chars (32 bytes) to avoid RangeError in timingSafeEqual
      const wrongHash = '0'.repeat(64);

      await expect(
        controller.handleMercadoPago(
          { type: 'payment', data: { id: 'pay-123' } },
          makeReq({ 'x-signature': `ts=123,v1=${wrongHash}`, 'x-request-id': '' }),
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);
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

    it('deve lançar BadRequestException quando valor pago é menor que o total do pedido (golpe do centavo)', async () => {
      // Order total is R$ 350.00 but attacker sends only R$ 0.01
      const ordersService = makeOrdersService(350.0);
      controller = new WebhooksController(makeFirebase(true), ordersService);

      const { signatureHeader } = buildSignature('pay-fraud');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          ...makeApprovedPayment('order-id'),
          id: 'pay-fraud',
          transaction_amount: 0.01, // attacker pays R$ 0.01 for a R$ 350 order
        }),
      });

      await expect(
        controller.handleMercadoPago(
          { type: 'payment', data: { id: 'pay-fraud' } },
          makeReq({ 'x-signature': signatureHeader, 'x-request-id': '' }),
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve processar normalmente quando valor pago cobre exatamente o total', async () => {
      const ordersService = makeOrdersService(89.9);
      controller = new WebhooksController(makeFirebase(true), ordersService);

      const { signatureHeader } = buildSignature('pay-123');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => makeApprovedPayment('order-id'), // transaction_amount: 89.9 === total: 89.9
      });

      const result = await controller.handleMercadoPago(
        { type: 'payment', data: { id: 'pay-123' } },
        makeReq({ 'x-signature': signatureHeader, 'x-request-id': '' }),
        {},
      );

      expect(result).toEqual({ received: true });
      expect(ordersService.updateStatus).toHaveBeenCalledWith('order-id', 'PAID', 'webhook_mercadopago');
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
    beforeEach(() => {
      process.env.CIELO_MERCHANT_ID = 'merchant-id-test';
      process.env.CIELO_MERCHANT_KEY = 'merchant-key-test';
    });

    afterEach(() => {
      delete process.env.CIELO_MERCHANT_ID;
      delete process.env.CIELO_MERCHANT_KEY;
    });

    function mockCieloApi(status: number, amountCentavos: number) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Payment: { Status: status, Amount: amountCentavos },
        }),
      });
    }

    it('deve retornar received: true sem merchant_order_number', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      const result = await controller.handleCielo({ headers: {}, body: {} });
      expect(result).toEqual({ received: true });
    });

    it('deve lançar BadRequestException quando PaymentId está ausente no body', async () => {
      controller = new WebhooksController(makeFirebase(), makeOrdersService());

      await expect(
        controller.handleCielo({
          headers: {},
          body: { order_status: '4', order_number: 'CP-12345678' }, // sem PaymentId
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve marcar pedido como PAID quando API da Cielo confirma pagamento', async () => {
      const ordersService = makeOrdersService(89.9);
      controller = new WebhooksController(makeFirebase(), ordersService);

      mockCieloApi(2, 8990); // status 2 = PaymentConfirmed, 8990 centavos = R$ 89,90

      const result = await controller.handleCielo({
        headers: {},
        body: { order_status: '4', order_number: 'CP-12345678', PaymentId: 'cielo-pay-guid' },
      });

      expect(result).toEqual({ received: true });
      expect(ordersService.updateStatus).toHaveBeenCalledWith('order-id', 'PAID', 'webhook_cielo');
    });

    it('deve ignorar pedido já marcado como PAID', async () => {
      const ordersService = makeOrdersService(89.9);
      ordersService.findByOrderNumber = jest.fn().mockResolvedValue({ id: 'order-id', status: 'PAID', total: 89.9 });
      controller = new WebhooksController(makeFirebase(), ordersService);

      mockCieloApi(2, 8990);

      await controller.handleCielo({
        headers: {},
        body: { order_status: '4', order_number: 'CP-12345678', PaymentId: 'cielo-pay-guid' },
      });

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('deve retornar received: true quando API Cielo retorna status não aprovado', async () => {
      const ordersService = makeOrdersService(89.9);
      controller = new WebhooksController(makeFirebase(), ordersService);

      mockCieloApi(3, 8990); // status 3 = Denied

      const result = await controller.handleCielo({
        headers: {},
        body: { order_status: '4', order_number: 'CP-12345678', PaymentId: 'cielo-pay-guid' },
      });

      expect(result).toEqual({ received: true });
      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException quando Amount da API é menor que o total do pedido', async () => {
      const ordersService = makeOrdersService(89.9); // order total R$ 89,90 = 8990 centavos
      controller = new WebhooksController(makeFirebase(), ordersService);

      mockCieloApi(2, 1); // API retorna apenas 1 centavo

      await expect(
        controller.handleCielo({
          headers: {},
          body: { order_status: '4', order_number: 'CP-12345678', PaymentId: 'cielo-pay-guid' },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('deve bloquear bypass NaN: Amount ausente na resposta da API é tratado como fraude', async () => {
      const ordersService = makeOrdersService(89.9);
      controller = new WebhooksController(makeFirebase(), ordersService);

      // API returns no Amount field — isNaN(undefined) = true → fail-secure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Payment: { Status: 2 } }), // Amount ausente
      });

      await expect(
        controller.handleCielo({
          headers: {},
          body: { order_status: '4', order_number: 'CP-12345678', PaymentId: 'cielo-pay-guid' },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });
  });
});
