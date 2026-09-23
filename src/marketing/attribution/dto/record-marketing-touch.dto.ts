import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Data collected from a landing URL. Campaign and user identifiers are not
 * accepted here: both are resolved by the server.
 *
 * UTM values are intentionally permissive — ad platforms freely put spaces,
 * pipes and unicode into tags. We clamp length here; the service sanitizes.
 */
export class RecordMarketingTouchDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'Некорректный ключ идемпотентности',
  })
  idempotencyKey?: string;

  @IsUUID('4', { message: 'Некорректный идентификатор посетителя' })
  anonymousId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/i, { message: 'Некорректный вариант кампании' })
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, {
    message: 'Некорректный адрес лендинга',
  })
  landingSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  utmId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  yclid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}
