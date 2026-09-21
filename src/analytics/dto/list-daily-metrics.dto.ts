import { IsDateString, IsOptional } from 'class-validator';

export class ListDailyMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
