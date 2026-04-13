import { Module } from '@nestjs/common';
import { StoreConfigController } from './store-config.controller';
import { StoreConfigService } from './store-config.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StoreConfigController],
  providers: [StoreConfigService],
})
export class StoreConfigModule {}
