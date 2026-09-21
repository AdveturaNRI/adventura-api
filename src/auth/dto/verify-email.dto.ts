import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @MinLength(1, { message: 'Токен обязателен' })
  token!: string;
}
