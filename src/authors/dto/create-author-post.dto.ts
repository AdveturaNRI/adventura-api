import {
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
} from 'class-validator';

import { CREATIVITY_CATEGORIES } from '../types/author.type';

export class CreateAuthorPostDto {
  @IsString({ message: 'Заголовок должен быть текстом' })
  @MinLength(1, { message: 'Добавьте заголовок' })
  @MaxLength(200, { message: 'Заголовок слишком длинный' })
  title!: string;

  @IsString({ message: 'Текст публикации должен быть строкой' })
  @MaxLength(20000, { message: 'Текст слишком длинный' })
  content!: string;

  @IsIn([...CREATIVITY_CATEGORIES], { message: 'Неизвестная категория' })
  category!: (typeof CREATIVITY_CATEGORIES)[number];

  @IsBoolean({ message: 'Флаг продажи указан неверно' })
  isForSale!: boolean;

  @ValidateIf((dto: CreateAuthorPostDto) => dto.isForSale)
  @IsNumber({}, { message: 'Цена должна быть числом' })
  @Min(1, { message: 'Цена должна быть больше нуля' })
  price?: number;

  @ValidateIf((dto: CreateAuthorPostDto) => dto.isForSale)
  @IsOptional()
  @IsString({ message: 'Валюта должна быть текстом' })
  @MaxLength(8, { message: 'Валюта слишком длинная' })
  currency?: string;

  @ValidateIf((dto: CreateAuthorPostDto) => dto.isForSale)
  @IsOptional()
  @IsString({ message: 'Описание покупки должно быть текстом' })
  @MaxLength(1000, { message: 'Описание покупки слишком длинное' })
  purchaseDescription?: string;

  @ValidateIf((dto: CreateAuthorPostDto) => dto.isForSale)
  @IsString({ message: 'Укажите ссылку для покупки' })
  @IsUrl({ require_tld: false }, { message: 'Укажите корректную ссылку для покупки' })
  @MaxLength(500, { message: 'Ссылка слишком длинная' })
  purchaseUrl?: string;
}
