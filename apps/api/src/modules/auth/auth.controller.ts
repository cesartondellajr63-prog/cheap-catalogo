import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ThrottleGuard, Throttle, ThrottleKey } from '../../shared/guards/throttle.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowSeconds: 900, lockoutSeconds: 900 })
  @ThrottleKey('auth_login')
  login(@Body() dto: LoginDto) {
    const { token, usuario } = this.authService.login(dto);
    return { ok: true, token, usuario };
  }

  @Get('verify')
  verify(@Headers('x-auth-token') token: string) {
    if (!token) {
      throw new UnauthorizedException('No token provided.');
    }

    const payload = this.authService.validateToken(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    return payload;
  }
}
