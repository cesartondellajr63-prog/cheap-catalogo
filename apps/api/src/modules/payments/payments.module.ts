import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentPollingService } from './payment-polling.service';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentPollingService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
