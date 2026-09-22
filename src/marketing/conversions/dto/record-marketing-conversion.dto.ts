import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const PUBLIC_TYPES = [
  'LANDING_VIEW',
  'CTA_CLICK',
  'REGISTRATION_STARTED',
] as const;

export type PublicMarketingConversionType = (typeof PUBLIC_TYPES)[number];

export class RecordMarketingConversionDto {
  @IsIn(PUBLIC_TYPES, { message: 'Некорректный тип конверсии' })
  type!: PublicMarketingConversionType;

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

  @IsString({ message: 'Некорректный ключ идемпотентности' })
  @MaxLength(160, { message: 'Слишком длинный ключ идемпотентности' })
  @Matches(/^[A-Za-z0-9:_\-./]+$/, { message: 'Некорректный ключ идемпотентности' })
  idempotencyKey!: string;

  @IsOptional()
  @IsObject({ message: 'props должен быть объектом' })
  props?: Record<string, unknown>;
}

