import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { QuoteShippingDto } from './dto/quote-shipping.dto';
import { ThrottleGuard, Throttle, ThrottleKey } from '../../shared/guards/throttle.guard';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('quote')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 15, windowSeconds: 300, lockoutSeconds: 300 })
  @ThrottleKey('shipping_quote')
  getQuote(@Body() dto: QuoteShippingDto) {
    return this.shippingService.getQuote(dto);
  }
}
