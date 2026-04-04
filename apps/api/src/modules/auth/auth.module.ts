import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { ThrottleGuard } from '../../shared/guards/throttle.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, ThrottleGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, ThrottleGuard],
})
export class AuthModule {}
