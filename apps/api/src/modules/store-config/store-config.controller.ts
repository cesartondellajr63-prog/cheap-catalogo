import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { StoreConfigService } from './store-config.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('config/store')
export class StoreConfigController {
  constructor(private readonly storeConfigService: StoreConfigService) {}

  @Get()
  get() {
    return this.storeConfigService.get();
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  update(@Body() body: { isOpen?: boolean; closedMessage?: string }) {
    return this.storeConfigService.update(body);
  }
}
