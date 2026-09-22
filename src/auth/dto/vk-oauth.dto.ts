import { IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class VkOAuthDto {
  /** Preferred: access_token after Auth.exchangeCode (VK ID SDK 2.x). */
  @ValidateIf((o: VkOAuthDto) => !o.silentToken)
  @IsString()
  @MinLength(1)
  accessToken?: string;

  /** Legacy silent_token path. */
  @ValidateIf((o: VkOAuthDto) => !o.accessToken)
  @IsString()
  @MinLength(1)
  silentToken?: string;

  @ValidateIf((o: VkOAuthDto) => Boolean(o.silentToken))
  @IsString()
  @MinLength(1)
  uuid?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  acquisitionSource?: string;

  @IsOptional()
  @IsUUID('4')
  anonymousId?: string;
}
