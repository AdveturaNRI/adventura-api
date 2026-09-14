import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Никнейм должен быть не короче 3 символов' })
  @MaxLength(24, { message: 'Никнейм должен быть не длиннее 24 символов' })
  @Matches(/^[^\s@]+$/, {
    message: 'Никнейм не должен содержать пробелы или @',
  })
  nickname?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statusIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  experienceTypeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  availability?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  age?: number;

  @IsOptional()
  @IsString()
  cityId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @ArrayMaxSize(3, { message: 'Можно указать не больше 3 городов' })
  cityIds?: string[];

  @IsOptional()
  @IsBoolean()
  playsOnline?: boolean;

  @IsOptional()
  @IsString()
  @IsTimeZone({ message: 'Укажите корректный часовой пояс' })
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  systems?: string[];

  @IsOptional()
  @IsBoolean()
  readyToLearnNew?: boolean;

  @IsOptional()
  @IsBoolean()
  openToAnySystem?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  about?: string;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  questionnaireStep?: number;
}
