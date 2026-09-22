import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class YandexOAuthDto {
  @IsString()
  @MinLength(1)
  accessToken!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  acquisitionSource?: string;

  @IsOptional()
  @IsUUID('4')
  anonymousId?: string;
}
