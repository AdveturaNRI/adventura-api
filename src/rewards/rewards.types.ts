import type {
  DiceSkinId,
  GrantableAuraId,
  GrantableAvatarFrameId,
  RewardBadgeTypeId,
} from './rewards.constants';

export type CosmeticUnlockDto = {
  kind: string;
  itemId: string;
};

export type UserRewardDto = {
  id: string;
  userId: string;
  badgeType: RewardBadgeTypeId;
  customDiceSkinId: string | null;
  bonusCharacterSlots: number;
  grantedAt: Date;
};

export type UnlockedPerksDto = {
  badges: RewardBadgeTypeId[];
  diceSkinIds: DiceSkinId[];
  bonusCharacterSlots: number;
  bonusPortraitGenerationsPerDay: number;
  avatarFrameId: string | null;
  questionnaireAuraId: string | null;
  visibleBadges: RewardBadgeTypeId[];
  ownedFrameIds: GrantableAvatarFrameId[];
  ownedAuraIds: GrantableAuraId[];
  unlockAllAvatarFrames: boolean;
  unlockAllAuras: boolean;
  unlockAllDiceSkins: boolean;
};

export type AccountLimitsDto = {
  maxActiveCharacters: number;
  dailyPortraitGenerations: number;
  usedPortraitGenerationsToday: number;
  remainingPortraitGenerations: number;
};

export type MyRewardsDto = {
  rewards: UserRewardDto[];
  perks: UnlockedPerksDto;
  limits: AccountLimitsDto;
};

export type GrantRewardResultDto = {
  created: boolean;
  reward: UserRewardDto;
};

export type UnlockCosmeticResultDto = {
  created: boolean;
  kind: string;
  all: boolean;
  itemId: string;
};

export type UnlockFrameResultDto = UnlockCosmeticResultDto;

export type GrantAlphaResultDto = {
  cutoff: string;
  scanned: number;
  granted: number;
  skipped: number;
};
