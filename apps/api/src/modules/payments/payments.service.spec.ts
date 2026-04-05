import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeFirebase({
  orderExists = true,
  sessionExists = true,
  tokenHash = '',
  sessionExpiresAt = Date.now() + 3600000,
} = {}) {
  const orderDocRef = {
    get: jest.fn().mockResolvedValue({
      exists: orderExists,
      data: () => ({ id: 'order-id', status: 'PENDING', orderNumber: 'CP-12345678' }),
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const sessionDocRef = {
    get: jest.fn().mockResolvedValue({
      exists: sessionExists,
      data: () => ({ tokenHash, expiresAt: sessionExpiresAt }),
    }),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const idempotencySnap = { empty: true, docs: [] };

  return {
    db: {
      collection: jest.fn().mockImplementation((name: string) => ({
        doc: jest.fn().mockReturnValue(name === 'sessions' ? sessionDocRef : orderDocRef),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(idempotencySnap),
        add: jest.fn().mockResolvedValue({ id: 'log-id' }),
      })),
    },
    _orderDocRef: orderDocRef,
    _sessionDocRef: sessionDocRef,
  } as any;
}

function makeOrdersService() {
  return {
    createWithId: jest.fn().mockResolvedValue({ id: 'order-id', orderNumber: 'CP-12345678' }),
    create: jest.fn().mockResolvedValue({ id: 'order-id', orderNumber: 'CP-12345678' }),
    findById: jest.fn().mockResolvedValue({ id: 'order-id', status: 'PENDING' }),
    updatePaymentInfo: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const basePixDto = {
  orderId: 'order-id',
  items: [{ model: 'Elfbar', flavor: 'Mango Ice', price: 89.9, qty: 1 }],
  shippingPrice: 5.0,
  customerName: 'João Silva',
  customerEmail: 'joao@teste.com',
  customerPhone: '11999999999',
  address: 'Rua das Flores, 123',
  city: 'Osasco',
};

describe('PaymentsService', () => {
  beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'mp-token-test';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.BACKEND_URL = 'http://localhost:3001';
    process.env.CIELO_MERCHANT_ID = 'cielo-merchant-id';
    process.env.CIELO_MERCHANT_KEY = 'cielo-merchant-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.CIELO_MERCHANT_ID;
    delete process.env.CIELO_MERCHANT_KEY;
  });

  // ── createPixPayment ────────────────────────────────────────────────────────

  describe('createPixPayment', () => {
    it('deve lançar InternalServerErrorException se MERCADOPAGO_ACCESS_TOKEN não configurado', async () => {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      const service = new PaymentsService(makeFirebase(), makeOrdersService());

      await expect(service.createPixPayment(basePixDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve criar preferência no MP e retornar checkoutUrl e accessToken', async () => {
      const firebase = makeFirebase({ orderExists: false });
      const service = new PaymentsService(firebase, makeOrdersService());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'pref-id', init_point: 'https://mp.com/checkout' }),
      });

      // Segundo get (após criação) retorna o pedido com orderNumber
      firebase._orderDocRef.get
        .mockResolvedValueOnce({ exists: false, data: () => null })
        .mockResolvedValue({ exists: true, data: () => ({ orderNumber: 'CP-12345678' }) });

      const result = await service.createPixPayment(basePixDto);

      expect(result.checkoutUrl).toBe('https://mp.com/checkout');
      expect(result).toHaveProperty('accessToken');
      expect(result.orderId).toBe('order-id');
    });

    it('deve lançar InternalServerErrorException se o MP retornar erro HTTP', async () => {
      const firebase = makeFirebase({ orderExists: false });
      const service = new PaymentsService(firebase, makeOrdersService());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(service.createPixPayment(basePixDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve salvar sessão no Firestore com TTL de ~2h', async () => {
      const firebase = makeFirebase({ orderExists: false });
      const service = new PaymentsService(firebase, makeOrdersService());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'pref-id', init_point: 'https://mp.com/checkout' }),
      });

      firebase._orderDocRef.get
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValue({ exists: true, data: () => ({ orderNumber: 'CP-12345678' }) });

      const before = Date.now();
      await service.createPixPayment(basePixDto);

      const setCall = (firebase._sessionDocRef.set as jest.Mock).mock.calls[0]?.[0];
      expect(setCall).toHaveProperty('tokenHash');
      expect(setCall.expiresAt).toBeGreaterThan(before + 2 * 60 * 60 * 1000 - 500);
    });
  });

  // ── getPaymentStatus ────────────────────────────────────────────────────────

  describe('getPaymentStatus', () => {
    it('deve lançar ForbiddenException se sessão não existir', async () => {
      const service = new PaymentsService(makeFirebase({ sessionExists: false }), makeOrdersService());

      await expect(service.getPaymentStatus('order-id', 'qualquer')).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException para accessToken inválido', async () => {
      const validToken = 'token-valido';
      const service = new PaymentsService(
        makeFirebase({ tokenHash: buildTokenHash(validToken), sessionExpiresAt: Date.now() + 3600000 }),
        makeOrdersService(),
      );

      await expect(service.getPaymentStatus('order-id', 'token-errado')).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException para token expirado', async () => {
      const validToken = 'token-valido';
      const service = new PaymentsService(
        makeFirebase({ tokenHash: buildTokenHash(validToken), sessionExpiresAt: Date.now() - 1000 }),
        makeOrdersService(),
      );

      await expect(service.getPaymentStatus('order-id', validToken)).rejects.toThrow(ForbiddenException);
    });

    it('deve retornar status pending quando não há pagamento no MP', async () => {
      const validToken = 'token-valido';
      const service = new PaymentsService(
        makeFirebase({ tokenHash: buildTokenHash(validToken), sessionExpiresAt: Date.now() + 3600000 }),
        makeOrdersService(),
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const result = await service.getPaymentStatus('order-id', validToken);

      expect(result.status).toBe('pending');
      expect(result.paymentId).toBeNull();
    });

    it('deve retornar status approved quando MP confirmar pagamento', async () => {
      const validToken = 'token-valido';
      const service = new PaymentsService(
        makeFirebase({ tokenHash: buildTokenHash(validToken), sessionExpiresAt: Date.now() + 3600000 }),
        makeOrdersService(),
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            id: 'pay-123',
            status: 'approved',
            transaction_amount: 89.9,
            metadata: {},
            preference_id: 'pref-1',
          }],
        }),
      });

      const result = await service.getPaymentStatus('order-id', validToken);

      expect(result.status).toBe('approved');
      expect(result.paymentId).toBe('pay-123');
    });
  });
});
