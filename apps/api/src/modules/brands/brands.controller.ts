import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BrandsService, BrandDto } from './brands.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: BrandDto) {
    return this.brandsService.create(dto);
  }
}
