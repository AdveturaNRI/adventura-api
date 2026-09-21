import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertFcmTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class RemoveFcmTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
