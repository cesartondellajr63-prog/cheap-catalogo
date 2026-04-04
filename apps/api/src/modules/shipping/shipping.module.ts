import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ThrottleGuard } from '../../shared/guards/throttle.guard';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, ThrottleGuard],
  exports: [ShippingService],
})
export class ShippingModule {}
