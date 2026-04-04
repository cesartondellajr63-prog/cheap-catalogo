import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-auth-token'] as string;

    if (!token) {
      throw new UnauthorizedException('No authentication token provided.');
    }

    const payload = this.authService.validateToken(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    request.user = payload;
    return true;
  }
}
