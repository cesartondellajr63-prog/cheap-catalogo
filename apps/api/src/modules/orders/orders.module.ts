import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [AuthModule, CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
