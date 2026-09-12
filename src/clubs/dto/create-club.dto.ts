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
  @IsInt()
  @Min(1)
  @Max(7)
  day!: number;

  @IsBoolean()
  closed!: boolean;

  @ValidateIf((d: ClubScheduleDayDto) => !d.closed)
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  open?: string | null;

  @ValidateIf((d: ClubScheduleDayDto) => !d.closed)
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  close?: string | null;
}

export class CreateClubDto {
  @IsString()
  @MinLength(2, { message: 'Название слишком короткое' })
  @MaxLength(120, { message: 'Название слишком длинное' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsString()
  @MinLength(5, { message: 'Укажите адрес' })
  @MaxLength(300)
  address!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsString()
  cityId?: string | null;

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ClubScheduleDayDto)
  schedule!: ClubScheduleDayDto[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
