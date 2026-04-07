import { IsString, IsArray, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  productId: string;

  // productName and variantName are accepted for display, but the server
  // overwrites them with authoritative values from the database.
  @IsString()
  productName: string;

  @IsString()
  variantId: string;

  @IsString()
  variantName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  // unitPrice sent by the client is intentionally ignored.
  // The server always resolves the authoritative price from Firestore.
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  customerName: string;

  @IsString()
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  // zipCode is used server-side to validate shippingCost against the cached
  // Lalamove quote. The client-supplied shippingCost is always overridden by
  // the cached value when a valid quote exists.
  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsNumber()
  @Min(0)
  shippingCost: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
