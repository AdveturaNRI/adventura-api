import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GeocodeSuggestQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  countrycodes?: string;

  /** address — улицы/дома; city — города и населённые пункты */
  @IsOptional()
  @IsString()
  @IsIn(['address', 'city'])
  kind?: 'address' | 'city';
}
