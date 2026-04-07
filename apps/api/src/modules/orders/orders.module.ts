import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { GoogleSheetsModule } from '../../shared/google-sheets/google-sheets.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [AuthModule, CustomersModule, GoogleSheetsModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
