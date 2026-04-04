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

  @Get(':id')
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

  @Patch(':id/motoboy')
  @UseGuards(JwtAuthGuard)
  updateMotoboy(
    @Param('id') id: string,
    @Body('motoboy') motoboy: string,
  ) {
    return this.ordersService.updateMotoboy(id, motoboy);
  }
}
