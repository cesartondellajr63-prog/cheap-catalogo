import { IsOptional, IsString } from 'class-validator';

export class QuoteShippingDto {
  @IsString()
  lat: string;

  @IsString()
  lng: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  zipCode?: string; // usado como chave de cache quando disponível
}
