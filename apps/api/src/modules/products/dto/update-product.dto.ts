import { IsString, IsNumber, IsArray, Min, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  basePrice?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  variants?: any[];
}
