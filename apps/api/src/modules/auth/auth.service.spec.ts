import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    process.env.DASHBOARD_USER = 'admin';
    process.env.DASHBOARD_PASS = 'senha123';
    process.env.JWT_SECRET = 'segredo-de-teste-32-chars-minimo!!';
  });

  afterEach(() => {
    delete process.env.DASHBOARD_USER;
    delete process.env.DASHBOARD_PASS;
    delete process.env.JWT_SECRET;
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('deve retornar token JWT ao receber credenciais corretas', () => {
      const result = service.login({ usuario: 'admin', senha: 'senha123' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('usuario', 'admin');
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.').length).toBe(2);
    });

    it('deve lançar UnauthorizedException para senha incorreta', () => {
      expect(() =>
        service.login({ usuario: 'admin', senha: 'errada' }),
      ).toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException para usuário incorreto', () => {
      expect(() =>
        service.login({ usuario: 'desconhecido', senha: 'senha123' }),
      ).toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando DASHBOARD_USER não está configurado', () => {
      delete process.env.DASHBOARD_USER;
      expect(() =>
        service.login({ usuario: 'admin', senha: 'senha123' }),
      ).toThrow(UnauthorizedException);
    });
  });

  // ── validateToken ──────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('deve retornar payload para token válido', () => {
      const { token } = service.login({ usuario: 'admin', senha: 'senha123' });
      const payload = service.validateToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.u).toBe('admin');
      expect(payload?.role).toBe('admin');
    });

    it('deve retornar null para token com assinatura inválida', () => {
      const { token } = service.login({ usuario: 'admin', senha: 'senha123' });
      const tampered = token.slice(0, -4) + 'xxxx';

      expect(service.validateToken(tampered)).toBeNull();
    });

    it('deve retornar null para token expirado', () => {
      const { token } = service.login({ usuario: 'admin', senha: 'senha123' });

      // Decodifica, força expiração e re-assina
      const [base] = token.split('.');
      const payload = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));
      payload.exp = Date.now() - 1000; // já expirado

      const newBase = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const crypto = require('crypto');
      const sig = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(newBase)
        .digest('hex');
      const expiredToken = `${newBase}.${sig}`;

      expect(service.validateToken(expiredToken)).toBeNull();
    });

    it('deve retornar null para string aleatória', () => {
      expect(service.validateToken('nao.e.um.token.valido')).toBeNull();
    });

    it('deve retornar null para token sem ponto separador', () => {
      expect(service.validateToken('sempontoseparador')).toBeNull();
    });
  });
});
