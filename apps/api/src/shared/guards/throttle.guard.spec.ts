import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottleGuard } from './throttle.guard';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDocRef(data: any = null, exists = false) {
  return {
    get: jest.fn().mockResolvedValue({ exists, data: () => data }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFirebase(docData: any = null, docExists = false) {
  const docRef = makeDocRef(docData, docExists);
  return {
    db: {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(docRef),
      }),
    },
    _docRef: docRef,
  } as any;
}

function makeReflector(throttleConfig: any, throttleKey = 'default') {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'throttle') return throttleConfig;
      if (key === 'throttleKey') return throttleKey;
    }),
  } as unknown as Reflector;
}

function makeContext(ip = '127.0.0.1') {
  return {
    getHandler: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        headers: {},
        socket: { remoteAddress: ip },
      }),
    }),
  } as any;
}

const defaultThrottle = { limit: 5, windowSeconds: 60, lockoutSeconds: 300 };

describe('ThrottleGuard', () => {
  it('deve permitir requisição quando não há configuração de throttle', async () => {
    const firebase = makeFirebase();
    const reflector = makeReflector(undefined);
    const guard = new ThrottleGuard(reflector, firebase);

    const result = await guard.canActivate(makeContext());
    expect(result).toBe(true);
  });

  it('deve permitir primeira requisição dentro do limite', async () => {
    const firebase = makeFirebase(null, false); // doc não existe ainda
    const reflector = makeReflector(defaultThrottle);
    const guard = new ThrottleGuard(reflector, firebase);

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(firebase._docRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('deve resetar contador quando a janela de tempo expirou', async () => {
    const expiredWindowData = {
      attempts: 4,
      windowStart: Date.now() - 120000, // 2 minutos atrás (janela de 60s expirou)
      blockedUntil: null,
    };
    const firebase = makeFirebase(expiredWindowData, true);
    const reflector = makeReflector(defaultThrottle);
    const guard = new ThrottleGuard(reflector, firebase);

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(firebase._docRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('deve bloquear IP ao atingir o limite de tentativas', async () => {
    const atLimitData = {
      attempts: 4, // próxima será a 5ª = limite
      windowStart: Date.now() - 10000, // janela ainda ativa
      blockedUntil: null,
    };
    const firebase = makeFirebase(atLimitData, true);
    const reflector = makeReflector(defaultThrottle);
    const guard = new ThrottleGuard(reflector, firebase);

    await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
    await expect(guard.canActivate(makeContext())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('deve retornar 429 para IP que já está bloqueado', async () => {
    const blockedData = {
      attempts: 5,
      windowStart: Date.now() - 10000,
      blockedUntil: Date.now() + 300000, // ainda bloqueado por 5 minutos
    };
    const firebase = makeFirebase(blockedData, true);
    const reflector = makeReflector(defaultThrottle);
    const guard = new ThrottleGuard(reflector, firebase);

    await expect(guard.canActivate(makeContext())).rejects.toThrow(HttpException);
    await expect(guard.canActivate(makeContext())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('deve usar o IP do header x-forwarded-for quando disponível', async () => {
    const firebase = makeFirebase(null, false);
    const reflector = makeReflector(defaultThrottle, 'auth');
    const guard = new ThrottleGuard(reflector, firebase);

    const ctx = {
      getHandler: jest.fn().mockReturnValue({}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
          socket: { remoteAddress: '127.0.0.1' },
        }),
      }),
    } as any;

    await guard.canActivate(ctx);

    const docCall = firebase.db.collection('rate_limits').doc;
    expect(docCall).toHaveBeenCalledWith('192.168.1.1_auth');
  });
});
