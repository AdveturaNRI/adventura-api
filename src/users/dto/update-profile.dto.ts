import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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
import {
  GAME_COST_FORMATS,
  PLAYER_PAYMENT_FORMATS,
  SESSION_PRICE_KINDS,
  SESSION_PRICE_MAX,
  SESSION_PRICE_MIN,
} from '../types/questionnaire-payment';

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
  @IsBoolean()
  prefersFreeOnly?: boolean;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn([...GAME_COST_FORMATS], { message: 'Укажите формат оплаты игр' })
  gameCostFormat?: (typeof GAME_COST_FORMATS)[number] | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn([...SESSION_PRICE_KINDS], { message: 'Укажите вид стоимости сессии' })
  sessionPriceKind?: (typeof SESSION_PRICE_KINDS)[number] | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(SESSION_PRICE_MIN, { message: 'Стоимость должна быть больше нуля' })
  @Max(SESSION_PRICE_MAX, { message: 'Стоимость слишком большая' })
  sessionPriceMin?: number | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(SESSION_PRICE_MIN, { message: 'Стоимость должна быть больше нуля' })
  @Max(SESSION_PRICE_MAX, { message: 'Стоимость слишком большая' })
  sessionPriceMax?: number | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn([...PLAYER_PAYMENT_FORMATS], { message: 'Укажите формат оплаты' })
  playerPaymentFormat?: (typeof PLAYER_PAYMENT_FORMATS)[number] | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn([...SESSION_PRICE_KINDS], { message: 'Укажите вид бюджета игрока' })
  playerBudgetKind?: (typeof SESSION_PRICE_KINDS)[number] | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(SESSION_PRICE_MIN, { message: 'Стоимость должна быть больше нуля' })
  @Max(SESSION_PRICE_MAX, { message: 'Стоимость слишком большая' })
  playerBudgetMin?: number | null;

  @IsOptional()
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(SESSION_PRICE_MIN, { message: 'Стоимость должна быть больше нуля' })
  @Max(SESSION_PRICE_MAX, { message: 'Стоимость слишком большая' })
  playerBudgetMax?: number | null;

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

  @IsOptional()
  @IsBoolean()
  notificationSoundsEnabled?: boolean;

  @IsOptional()
  @IsString()
  notificationSoundPresetId?: string | null;

  @IsOptional()
  @IsBoolean()
  useCustomNotificationSound?: boolean;
}
