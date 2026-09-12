import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum CreateGameKindDto {
  ONESHOT = 'ONESHOT',
  CAMPAIGN = 'CAMPAIGN',
}

export class CreateGameDto {
  @IsString()
  @MinLength(2, { message: 'Название слишком короткое' })
  @MaxLength(120, { message: 'Название слишком длинное' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsInt()
  @Min(1)
  @Max(20)
  maxPlayers!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  durationHours?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  systemName!: string;

  @IsEnum(CreateGameKindDto)
  kind!: CreateGameKindDto;

  @IsBoolean()
  isOnline!: boolean;

  @ValidateIf((dto: CreateGameDto) => !dto.isOnline)
  @IsString()
  cityId?: string | null;

  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsString()
  @IsTimeZone({ message: 'Укажите корректный часовой пояс' })
  timezone?: string;

  @IsBoolean()
  isFree!: boolean;

  @ValidateIf((dto: CreateGameDto) => !dto.isFree)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceRub?: number | null;

  @IsBoolean()
  beginnersWelcome!: boolean;

  @ValidateIf((dto: CreateGameDto) => !dto.beginnersWelcome)
  @IsString()
  experienceTypeId?: string | null;

  @IsBoolean()
  anyAge!: boolean;

  @ValidateIf((dto: CreateGameDto) => !dto.anyAge)
  @IsInt()
  @Min(12)
  @Max(99)
  minAge?: number | null;
}
