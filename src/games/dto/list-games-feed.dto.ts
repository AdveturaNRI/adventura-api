import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
} from 'class-validator';

export const GAME_FEED_STATUSES = ['RECRUITING', 'CLOSED'] as const;
export type GameFeedStatus = (typeof GAME_FEED_STATUSES)[number];

export const GAME_FEED_KINDS = ['ONESHOT', 'CAMPAIGN'] as const;
export type GameFeedKind = (typeof GAME_FEED_KINDS)[number];

export const GAME_FEED_AGES = ['any', '12', '16', '18'] as const;
export type GameFeedAge = (typeof GAME_FEED_AGES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toOptionalBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return value as boolean;
}

export class ListGamesFeedQueryDto {
  @IsOptional()
  @IsIn(GAME_FEED_STATUSES, {
    message: 'status должен быть RECRUITING или CLOSED',
  })
  status?: GameFeedStatus = 'RECRUITING';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(GAME_FEED_KINDS, {
    message: 'kind должен быть ONESHOT или CAMPAIGN',
  })
  kind?: GameFeedKind;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cityId?: string;

  /** Comma-separated city ids; offline games matching any of them. */
  @IsOptional()
  @IsString()
  @MaxLength(220)
  cityIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  system?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  hasSeats?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  beginnersWelcome?: boolean;

  @IsOptional()
  @IsIn(GAME_FEED_AGES, {
    message: 'age должен быть any, 12, 16 или 18',
  })
  age?: GameFeedAge;

  /** Inclusive range start, YYYY-MM-DD (сутки в поясе зрителя) */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'scheduledFrom должен быть YYYY-MM-DD' })
  scheduledFrom?: string;

  /** Inclusive range end, YYYY-MM-DD (сутки в поясе зрителя) */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'scheduledTo должен быть YYYY-MM-DD' })
  scheduledTo?: string;

  /**
   * upcoming = без даты или с датой от «сейчас» в поясе зрителя;
   * past = с датой раньше «сейчас» (без даты не попадают).
   */
  @IsOptional()
  @IsIn(['upcoming', 'past'], {
    message: 'schedulePreset должен быть upcoming или past',
  })
  schedulePreset?: 'upcoming' | 'past';

  /** Подсказка пояса с клиента; приоритет у timezone из профиля. */
  @IsOptional()
  @IsString()
  @IsTimeZone({ message: 'Укажите корректный часовой пояс' })
  timezone?: string;
}
