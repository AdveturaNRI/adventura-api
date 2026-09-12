import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GeocodeQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  countrycodes?: string;
}
