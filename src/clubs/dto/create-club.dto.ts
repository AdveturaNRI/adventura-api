import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ClubScheduleDayDto {
  /** 1 = пн … 7 = вс */
  @IsInt({ message: 'Номер дня должен быть целым числом' })
  @Min(1, { message: 'Номер дня должен быть от 1 до 7' })
  @Max(7, { message: 'Номер дня должен быть от 1 до 7' })
  day!: number;

  @IsBoolean({ message: 'Для дня нужно указать, работает ли клуб' })
  closed!: boolean;

  @ValidateIf((d: ClubScheduleDayDto) => !d.closed)
  @IsString({ message: 'Время укажите в формате ЧЧ:ММ' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  open?: string | null;

  @ValidateIf((d: ClubScheduleDayDto) => !d.closed)
  @IsString({ message: 'Время укажите в формате ЧЧ:ММ' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  close?: string | null;
}

export class ClubLinkDto {
  @IsString({ message: 'Название ссылки должно быть текстом' })
  @MinLength(2, { message: 'Название ссылки слишком короткое' })
  @MaxLength(80, { message: 'Название ссылки слишком длинное' })
  label!: string;

  @IsUrl({ require_tld: false }, { message: 'Укажите корректную ссылку' })
  @MaxLength(500, { message: 'Ссылка слишком длинная' })
  url!: string;
}

export class CreateClubDto {
  @IsString({ message: 'Название клуба должно быть текстом' })
  @MinLength(2, { message: 'Название слишком короткое' })
  @MaxLength(120, { message: 'Название слишком длинное' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Описание клуба должно быть текстом' })
  @MaxLength(4000, { message: 'Описание не должно быть длиннее 4000 символов' })
  description?: string | null;

  @IsString({ message: 'Адрес должен быть текстом' })
  @MinLength(5, { message: 'Укажите адрес' })
  @MaxLength(300, { message: 'Адрес слишком длинный' })
  address!: string;

  @IsNumber({}, { message: 'Широта должна быть числом' })
  @Min(-90, { message: 'Широта должна быть от -90 до 90' })
  @Max(90, { message: 'Широта должна быть от -90 до 90' })
  lat!: number;

  @IsNumber({}, { message: 'Долгота должна быть числом' })
  @Min(-180, { message: 'Долгота должна быть от -180 до 180' })
  @Max(180, { message: 'Долгота должна быть от -180 до 180' })
  lng!: number;

  @IsOptional()
  @IsString({ message: 'Идентификатор города должен быть текстом' })
  cityId?: string | null;

  @IsOptional()
  @IsArray({ message: 'Теги должны быть списком' })
  @ArrayMaxSize(12, { message: 'Можно указать не больше 12 тегов' })
  @IsString({ each: true, message: 'Каждый тег должен быть текстом' })
  @MinLength(2, { each: true, message: 'Каждый тег должен содержать минимум 2 символа' })
  @MaxLength(40, { each: true, message: 'Каждый тег не должен быть длиннее 40 символов' })
  tags?: string[];

  @IsOptional()
  @IsArray({ message: 'Ссылки должны быть списком' })
  @ArrayMaxSize(8, { message: 'Можно указать не больше 8 ссылок' })
  @ValidateNested({ each: true })
  @Type(() => ClubLinkDto)
  links?: ClubLinkDto[];

  @IsArray({ message: 'Расписание должно быть списком дней' })
  @ArrayMinSize(7, { message: 'Расписание должно содержать все 7 дней недели' })
  @ArrayMaxSize(7, { message: 'Расписание не может содержать больше 7 дней' })
  @ValidateNested({ each: true })
  @Type(() => ClubScheduleDayDto)
  schedule!: ClubScheduleDayDto[];

  @IsOptional()
  @IsBoolean({ message: 'Статус публикации указан неверно' })
  isPublished?: boolean;

  @IsOptional()
  @IsInt({ message: 'Количество столов должно быть целым числом' })
  @Min(1, { message: 'Минимум 1 стол' })
  @Max(100, { message: 'Максимум 100 столов' })
  tablesCount?: number;
}
