import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  COSMETIC_KIND_ALL,
  COSMETIC_KINDS,
  GRANTABLE_AVATAR_FRAME_IDS,
  REWARD_BADGE_TYPES,
} from '../rewards.constants';

export class GrantRewardDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsIn([...REWARD_BADGE_TYPES])
  badgeType!: (typeof REWARD_BADGE_TYPES)[number];
}

export class UnlockFrameDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsOptional()
  @IsIn([...GRANTABLE_AVATAR_FRAME_IDS])
  frameId?: (typeof GRANTABLE_AVATAR_FRAME_IDS)[number];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class UnlockCosmeticDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsIn([...COSMETIC_KINDS, COSMETIC_KIND_ALL])
  kind!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemId?: string;

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class GrantAlphaTestersDto {
  @IsOptional()
  @IsString()
  cutoff?: string;
}
