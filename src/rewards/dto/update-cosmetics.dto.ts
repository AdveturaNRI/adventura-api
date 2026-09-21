import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { REWARD_BADGE_TYPES } from '../rewards.constants';

export class UpdateCosmeticsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  avatarFrameId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  questionnaireAuraId?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn([...REWARD_BADGE_TYPES], { each: true })
  badgeTypes?: string[];
}
