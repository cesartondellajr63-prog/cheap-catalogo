import { InternalServerErrorException } from '@nestjs/common';
import { ShippingService } from './shipping.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFirebase(cacheData: any = null, cacheExists = false) {
  const cacheSnap = {
    exists: cacheExists,
    data: () => cacheData,
  };

  const docRef = {
    get: jest.fn().mockResolvedValue(cacheSnap),
    set: jest.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(docRef),
      }),
    },
    _docRef: docRef,
  } as any;
}

function mockFetch(...responses: any[]) {
  let call = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const res = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve(res);
  });
}

// Valid Brazilian coordinates (São Paulo area)
const baseDto = { lat: '-23.5', lng: '-46.7', zipCode: '06088-170', address: 'Rua das Flores, 123' };

describe('ShippingService', () => {
  beforeEach(() => {
    process.env.LALAMOVE_API_KEY = 'lala-key';
    process.env.LALAMOVE_API_SECRET = 'lala-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LALAMOVE_API_KEY;
    delete process.env.LALAMOVE_API_SECRET;
  });

  // ── cache ───────────────────────────────────────────────────────────────────

  describe('cache', () => {
    it('deve retornar cotação cacheada do Firestore se válida (não chamar Lalamove)', async () => {
      const cachedPrice = 15.5;
      const firebase = makeFirebase({ price: cachedPrice, expiresAt: Date.now() + 60000 }, true);
      const service = new ShippingService(firebase);

      global.fetch = jest.fn();
      const result = await service.getQuote(baseDto);

      expect(result.price).toBe(cachedPrice);
      expect(result.cached).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deve chamar Lalamove se cache estiver expirado', async () => {
      const firebase = makeFirebase({ price: 10, expiresAt: Date.now() - 1000 }, true);
      const service = new ShippingService(firebase);

      mockFetch(
        // Lalamove (only 1 call now — lat/lng come directly from frontend)
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '25.00' } } }) },
      );

      const result = await service.getQuote(baseDto);

      expect(result).toHaveProperty('price');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('deve salvar nova cotação no Firestore com expiresAt no futuro', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '25.00' } } }) },
      );

      const before = Date.now();
      await service.getQuote(baseDto);

      const docRef = (firebase as any)._docRef;
      // set is called async (fire-and-forget), wait a tick
      await new Promise(r => setTimeout(r, 50));
      const setCall = (docRef.set as jest.Mock).mock.calls[0]?.[0];

      expect(setCall).toHaveProperty('price');
      expect(setCall.expiresAt).toBeGreaterThan(before);
    });
  });

  // ── erros ───────────────────────────────────────────────────────────────────

  describe('erros', () => {
    it('deve lançar InternalServerErrorException se Lalamove retornar preço zero', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '0' } } }) },
      );

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve lançar InternalServerErrorException se Lalamove retornar erro HTTP', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: false, status: 500, text: async () => 'Internal Server Error' },
      );

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve lançar InternalServerErrorException para coordenadas inválidas', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      global.fetch = jest.fn();
      await expect(
        service.getQuote({ lat: 'abc', lng: 'xyz', zipCode: '00000-000', address: 'Test' }),
      ).rejects.toThrow(InternalServerErrorException);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
