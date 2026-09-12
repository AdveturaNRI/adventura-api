import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'Refresh token обязателен' })
  refreshToken!: string;
}
