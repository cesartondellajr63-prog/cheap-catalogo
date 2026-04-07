import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query('status') status?: string) {
    return this.ordersService.findAll(status ? { status } : undefined);
  }

  @Get('track/:orderNumber')
  async trackOrder(@Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.findByOrderNumber(orderNumber);
    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      address: order.address,
      city: order.city,
      items: order.items,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      status: order.status,
      shippingStatus: order.shippingStatus ?? null,
      trackingLink: order.trackingLink ?? null,
      motoboy: order.motoboy ?? null,
      createdAt: order.createdAt,
      paidAt: (order as any).paidAt ?? null,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    const actorId = req.user?.u || 'admin';
    return this.ordersService.updateStatus(id, status, actorId);
  }

  @Patch(':id/shipping-status')
  @UseGuards(JwtAuthGuard)
  updateShippingStatus(
    @Param('id') id: string,
    @Body('shippingStatus') shippingStatus: string,
  ) {
    return this.ordersService.updateShippingStatus(id, shippingStatus);
  }

  @Patch(':id/tracking')
  @UseGuards(JwtAuthGuard)
  updateTrackingLink(
    @Param('id') id: string,
    @Body('trackingLink') trackingLink: string,
  ) {
    return this.ordersService.updateTrackingLink(id, trackingLink);
  }

  @Patch(':id/motoboy')
  @UseGuards(JwtAuthGuard)
  updateMotoboy(
    @Param('id') id: string,
    @Body('motoboy') motoboy: string,
  ) {
    return this.ordersService.updateMotoboy(id, motoboy);
  }

  @Patch(':id/payment-method')
  @UseGuards(JwtAuthGuard)
  setPaymentMethod(
    @Param('id') id: string,
    @Body('method') method: 'mp' | 'cielo',
  ) {
    return this.ordersService.setPaymentMethod(id, method);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard)
  archive(@Param('id') id: string) {
    return this.ordersService.archive(id);
  }

  @Patch(':id/unarchive')
  @UseGuards(JwtAuthGuard)
  unarchive(@Param('id') id: string) {
    return this.ordersService.unarchive(id);
  }
}
