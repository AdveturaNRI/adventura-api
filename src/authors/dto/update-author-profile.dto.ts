import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  AUTHOR_CONTACT_TYPES,
  CREATIVITY_CATEGORIES,
} from '../types/author.type';

export class AuthorContactInputDto {
  @IsIn([...AUTHOR_CONTACT_TYPES], { message: 'Неизвестный тип контакта' })
  type!: (typeof AUTHOR_CONTACT_TYPES)[number];

  @IsString({ message: 'Название контакта должно быть текстом' })
  @MinLength(1, { message: 'Укажите название контакта' })
  @MaxLength(80, { message: 'Название контакта слишком длинное' })
  label!: string;

  @IsString({ message: 'Адрес контакта должен быть текстом' })
  @MinLength(1, { message: 'Укажите адрес контакта' })
  @MaxLength(500, { message: 'Адрес контакта слишком длинный' })
  url!: string;
}

export class UpdateAuthorProfileDto {
  @IsString({ message: 'Описание должно быть текстом' })
  @MaxLength(500, { message: 'Описание не длиннее 500 символов' })
  description!: string;

  @IsArray({ message: 'Категории должны быть списком' })
  @ArrayMaxSize(6, { message: 'Слишком много категорий' })
  @IsIn([...CREATIVITY_CATEGORIES], {
    each: true,
    message: 'Неизвестная категория творчества',
  })
  categories!: (typeof CREATIVITY_CATEGORIES)[number][];

  @IsArray({ message: 'Контакты должны быть списком' })
  @ArrayMaxSize(8, { message: 'Можно указать не больше 8 контактов' })
  @ValidateNested({ each: true })
  @Type(() => AuthorContactInputDto)
  contacts!: AuthorContactInputDto[];
}
