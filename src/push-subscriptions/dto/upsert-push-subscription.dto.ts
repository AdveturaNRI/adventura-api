import { Type } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(1)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  auth!: string;
}

export class UpsertPushSubscriptionDto {
  @IsString()
  @MinLength(1)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
