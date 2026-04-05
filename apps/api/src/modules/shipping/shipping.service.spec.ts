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

const baseDto = { zipCode: '06088-170', address: 'Rua das Flores, 123' };

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
        // ViaCEP
        { ok: true, json: async () => ({ localidade: 'Osasco', uf: 'SP' }) },
        // Nominatim
        { ok: true, json: async () => [{ lat: '-23.5', lon: '-46.7' }] },
        // Lalamove
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '2500' } } }) },
      );

      const result = await service.getQuote(baseDto);

      expect(result).toHaveProperty('price');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('deve salvar nova cotação no Firestore com expiresAt no futuro', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: true, json: async () => ({ localidade: 'Osasco', uf: 'SP' }) },
        { ok: true, json: async () => [{ lat: '-23.5', lon: '-46.7' }] },
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '2500' } } }) },
      );

      const before = Date.now();
      await service.getQuote(baseDto);

      const docRef = firebase.db.collection('shipping_quotes').doc('06088170');
      const setCall = (docRef.set as jest.Mock).mock.calls[0]?.[0];

      expect(setCall).toHaveProperty('price');
      expect(setCall.expiresAt).toBeGreaterThan(before);
    });
  });

  // ── erros ───────────────────────────────────────────────────────────────────

  describe('erros', () => {
    it('deve lançar InternalServerErrorException se CEP não for encontrado pelo ViaCEP', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch({ ok: true, json: async () => ({ erro: true }) });

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve lançar InternalServerErrorException se ViaCEP retornar erro HTTP', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch({ ok: false, status: 400 });

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve lançar InternalServerErrorException se Lalamove retornar preço zero', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: true, json: async () => ({ localidade: 'Osasco', uf: 'SP' }) },
        { ok: true, json: async () => [{ lat: '-23.5', lon: '-46.7' }] },
        { ok: true, json: async () => ({ data: { priceBreakdown: { total: '0' } } }) },
      );

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });

    it('deve lançar InternalServerErrorException se Lalamove retornar erro HTTP', async () => {
      const firebase = makeFirebase(null, false);
      const service = new ShippingService(firebase);

      mockFetch(
        { ok: true, json: async () => ({ localidade: 'Osasco', uf: 'SP' }) },
        { ok: true, json: async () => [{ lat: '-23.5', lon: '-46.7' }] },
        { ok: false, status: 500, text: async () => 'Internal Server Error' },
      );

      await expect(service.getQuote(baseDto)).rejects.toThrow(InternalServerErrorException);
    });
  });
});
