import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateCardPaymentDto } from './dto/create-card-payment.dto';
import { ThrottleGuard, Throttle, ThrottleKey } from '../../shared/guards/throttle.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('pix')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowSeconds: 300, lockoutSeconds: 300 })
  @ThrottleKey('payment_pix')
  createPixPayment(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPixPayment(dto);
  }

  @Post('card')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowSeconds: 300, lockoutSeconds: 300 })
  @ThrottleKey('payment_card')
  createCardPayment(@Body() dto: CreateCardPaymentDto) {
    return this.paymentsService.createCardPayment(dto);
  }

  @Get('status/:orderId')
  getPaymentStatus(
    @Param('orderId') orderId: string,
    @Headers('x-access-token') accessToken: string,
  ) {
    return this.paymentsService.getPaymentStatus(orderId, accessToken);
  }

  @Get('card-status/:orderId')
  getCardPaymentStatus(@Param('orderId') orderId: string) {
    return this.paymentsService.getCardPaymentStatus(orderId);
  }
}
