import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateCardPaymentDto } from './dto/create-card-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('pix')
  createPixPayment(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPixPayment(dto);
  }

  @Post('card')
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
