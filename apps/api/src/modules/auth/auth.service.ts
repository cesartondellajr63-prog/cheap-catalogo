import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';

export interface TokenPayload {
  u: string;
  role: string;
  t: number;
  exp: number;
}

@Injectable()
export class AuthService {
  login(dto: LoginDto): { token: string; usuario: string } {
    const dashboardUser = process.env.DASHBOARD_USER;
    const dashboardPass = process.env.DASHBOARD_PASS;

    if (dto.usuario !== dashboardUser || dto.senha !== dashboardPass) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const token = this.generateToken(dto.usuario);
    return { token, usuario: dto.usuario };
  }

  generateToken(usuario: string): string {
    const payload: TokenPayload = {
      u: usuario,
      role: 'admin',
      t: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    };

    const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JWT_SECRET as string;
    const sig = crypto.createHmac('sha256', secret).update(base).digest('hex');

    return `${base}.${sig}`;
  }

  validateToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;

      const [base, sig] = parts;
      const secret = process.env.JWT_SECRET as string;
      const expectedSig = crypto.createHmac('sha256', secret).update(base).digest('hex');

      if (sig !== expectedSig) return null;

      const payload: TokenPayload = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));

      if (!payload.exp || payload.exp < Date.now()) return null;

      return payload;
    } catch {
      return null;
    }
  }
}
