import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const UTM_VALUE = /^[A-Za-z0-9._~%+\-]+$/;
const YCLID_VALUE = /^[A-Za-z0-9_-]+$/;

/**
 * Data collected from a landing URL. Campaign and user identifiers are not
 * accepted here: both are resolved by the server.
 */
export class RecordMarketingTouchDto {
  @IsUUID('4', { message: 'Некорректный идентификатор посетителя' })
  anonymousId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z0-9]+$/i, { message: 'Некорректный вариант кампании' })
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
  @Matches(UTM_VALUE, { message: 'Некорректный utm_source' })
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(UTM_VALUE, { message: 'Некорректный utm_medium' })
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(UTM_VALUE, { message: 'Некорректный utm_campaign' })
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(UTM_VALUE, { message: 'Некорректный utm_content' })
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(UTM_VALUE, { message: 'Некорректный utm_term' })
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(UTM_VALUE, { message: 'Некорректный utm_id' })
  utmId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(YCLID_VALUE, { message: 'Некорректный yclid' })
  yclid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}
