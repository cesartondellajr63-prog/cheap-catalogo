import { IsString, IsNumber, IsArray, IsEmail, Min, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentItemDto {
  @IsString()
  productId: string;

  @IsString()
  model: string;

  @IsString()
  flavor: string;

  @IsNumber()
  @Min(1)
  qty: number;
}

export class CreatePaymentDto {
  @IsString()
  orderId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  items: PaymentItemDto[];

  @IsNumber()
  @Min(0)
  shippingPrice: number;

  @IsString()
  shippingToken: string;

  @IsEmail()
  customerEmail: string;

  @IsString()
  customerName: string;

  @IsString()
  customerPhone: string;

  @IsString()
  address: string;

  @IsString()
  city: string;
}
