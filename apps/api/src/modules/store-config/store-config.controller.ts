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
  update(@Body() body: { isOpen?: boolean; closedMessage?: string; closedMessageBot?: string; webhookEnabled?: boolean; closeWebhookEnabled?: boolean }) {
    return this.storeConfigService.update(body);
  }
}

@Controller('config/brands-filter')
export class BrandsFilterController {
  constructor(private readonly storeConfigService: StoreConfigService) {}

  @Get()
  get() {
    return this.storeConfigService.getBrandsFilter();
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  update(@Body() body: { visibleBrands?: string[]; customBrands?: { id: string; label: string; color: string }[] }) {
    return this.storeConfigService.updateBrandsFilter(body);
  }
}
