import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AnalyticsPlatform } from '@prisma/client';

export class AnalyticsClientEventDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(AnalyticsPlatform)
  platform?: AnalyticsPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}

export class IngestAnalyticsEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsClientEventDto)
  events!: AnalyticsClientEventDto[];

  @IsOptional()
  @IsEnum(AnalyticsPlatform)
  platform?: AnalyticsPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}
