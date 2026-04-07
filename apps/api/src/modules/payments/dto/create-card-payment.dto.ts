import {
  IsString, IsNumber, IsArray, IsEmail,
  Min, ValidateNested, IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CardItemDto {
  @IsString() productId: string;
  @IsString() name: string;
  @IsString() flavor: string;
  @IsNumber() @Min(0.01) price: number;
  @IsNumber() @Min(1) qty: number;
}

export class CreateCardPaymentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardItemDto)
  items: CardItemDto[];

  @IsNumber() @Min(0) shippingPrice: number;
  @IsString() shippingToken: string;

  @IsString() customerName: string;
  @IsEmail()  customerEmail: string;
  @IsString() customerPhone: string;

  @IsString() rua: string;
  @IsString() numero: string;
  @IsOptional() @IsString() complemento?: string;
  @IsString() bairro: string;
  @IsString() cidade: string;
  @IsString() estado: string;
  @IsString() cep: string;
}
