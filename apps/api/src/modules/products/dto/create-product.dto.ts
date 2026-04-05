import { IsString, IsNumber, IsArray, Min, IsBoolean, IsOptional } from 'class-validator';


export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  brandId: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  basePrice: number;

  @IsArray()
  @IsString({ each: true })
  images: string[];

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsArray()
  variants?: any[];
}
