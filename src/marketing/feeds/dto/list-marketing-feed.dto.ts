import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListMarketingFeedQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'Некорректный limit' })
  @Min(1, { message: 'Некорректный limit' })
  @Max(50, { message: 'Некорректный limit' })
  limit?: number;
}

