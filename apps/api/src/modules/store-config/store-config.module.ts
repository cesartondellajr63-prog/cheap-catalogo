import { Module } from '@nestjs/common';
import { StoreConfigController, BrandsFilterController } from './store-config.controller';
import { StoreConfigService } from './store-config.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StoreConfigController, BrandsFilterController],
  providers: [StoreConfigService],
})
export class StoreConfigModule {}
