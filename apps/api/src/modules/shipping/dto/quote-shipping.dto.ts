import { IsString, Matches } from 'class-validator';

export class QuoteShippingDto {
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' })
  zipCode: string;

  @IsString()
  address: string;
}
