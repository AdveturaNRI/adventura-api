import { IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @IsString()
  @MinLength(1, { message: 'Refresh token обязателен' })
  refreshToken!: string;
}
