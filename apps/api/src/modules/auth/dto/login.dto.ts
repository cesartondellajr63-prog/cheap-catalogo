import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  usuario: string;

  @IsString()
  @MinLength(6)
  senha: string;
}
