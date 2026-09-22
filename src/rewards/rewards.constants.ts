import type { RewardBadgeType } from '@prisma/client';

export const REWARD_BADGE_TYPES = [
  'alpha_tester',
  'bug_hunter',
  'founding_dm',
  'early_arrival',
  'tavern_keeper',
] as const satisfies readonly RewardBadgeType[];

export type RewardBadgeTypeId = (typeof REWARD_BADGE_TYPES)[number];

export const DICE_SKIN_IDS = [
  'standard',
  'alpha_pioneer',
  'neon_glitch',
  'founding_obsidian',
  'tavern_oak',
] as const;

export type DiceSkinId = (typeof DICE_SKIN_IDS)[number];

export const AVATAR_FRAME_IDS = [
  'none',
  'steel_band',
  'alpha_runes',
  'neon_scan',
  'founding_embers',
  'solar_flare',
  'frost_ring',
  'hex_circuit',
  'void_orbit',
  'sakura_fall',
  'storm_arc',
  'blood_moon',
  'prism_halo',
  'pixel_spark',
  'leaf_crown',
  'tide_ring',
  'ghost_veil',
  'copper_gear',
  'star_orbit',
  'oak_tankard',
] as const;

export type AvatarFrameId = (typeof AVATAR_FRAME_IDS)[number];
export type GrantableAvatarFrameId = Exclude<AvatarFrameId, 'none'>;

export const GRANTABLE_AVATAR_FRAME_IDS = AVATAR_FRAME_IDS.filter(
  (id): id is GrantableAvatarFrameId => id !== 'none',
);

export const QUESTIONNAIRE_AURA_IDS = [
  'none',
  'aurora',
  'neon_grid',
  'void_runes',
  'sakura_mist',
  'storm_veil',
  'blood_haze',
  'prism_shift',
  'pixel_rain',
  'forest_glow',
  'tide_caustic',
  'ghost_fog',
  'magma_flow',
  'star_field',
  'oak_shield',
] as const;
export type QuestionnaireAuraId = (typeof QUESTIONNAIRE_AURA_IDS)[number];
export type GrantableAuraId = Exclude<QuestionnaireAuraId, 'none'>;

export const GRANTABLE_AURA_IDS = QUESTIONNAIRE_AURA_IDS.filter(
  (id): id is GrantableAuraId => id !== 'none',
);

export const GRANTABLE_DICE_SKIN_IDS = DICE_SKIN_IDS.filter(
  (id): id is Exclude<DiceSkinId, 'standard'> => id !== 'standard',
);

export const COSMETIC_KIND_AVATAR_FRAME = 'avatar_frame';
export const COSMETIC_KIND_AURA = 'questionnaire_aura';
export const COSMETIC_KIND_DICE_SKIN = 'dice_skin';
export const COSMETIC_KIND_ALL = 'all';
export const COSMETIC_KINDS = [
  COSMETIC_KIND_AVATAR_FRAME,
  COSMETIC_KIND_AURA,
  COSMETIC_KIND_DICE_SKIN,
] as const;
export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

export const ALL_COSMETIC_ITEM_ID = '*';
export const ALL_AVATAR_FRAMES_ITEM_ID = ALL_COSMETIC_ITEM_ID;

export const FRAME_BY_BADGE: Record<RewardBadgeTypeId, GrantableAvatarFrameId | null> = {
  founding_dm: 'founding_embers',
  alpha_tester: 'alpha_runes',
  bug_hunter: 'neon_scan',
  early_arrival: 'steel_band',
  tavern_keeper: 'oak_tankard',
};

export const AURA_BY_BADGE: Record<RewardBadgeTypeId, GrantableAuraId | null> = {
  founding_dm: 'void_runes',
  alpha_tester: 'aurora',
  bug_hunter: 'neon_grid',
  early_arrival: null,
  tavern_keeper: 'oak_shield',
};

/**
 * Highest → lowest for auto-equip when the user has not chosen a frame/aura.
 * Хозяин таверны > Первый мастер > Первопроходец > Истребитель багов > Первая волна
 */
export const BADGE_DISPLAY_PRIORITY: RewardBadgeTypeId[] = [
  'tavern_keeper',
  'founding_dm',
  'alpha_tester',
  'bug_hunter',
  'early_arrival',
];

export const UNIQUE_AVATAR_FRAME_IDS = [
  ...new Set(Object.values(FRAME_BY_BADGE).filter((id): id is GrantableAvatarFrameId => Boolean(id))),
];

export const UNIQUE_AURA_IDS = [
  ...new Set(Object.values(AURA_BY_BADGE).filter((id): id is GrantableAuraId => Boolean(id))),
];

export const UNIQUE_DICE_SKIN_IDS = [...GRANTABLE_DICE_SKIN_IDS];

/** `*` открывает только обычную косметику, без уникальной с наград. */
export const WILDCARD_AVATAR_FRAME_IDS = GRANTABLE_AVATAR_FRAME_IDS.filter(
  (id) => !UNIQUE_AVATAR_FRAME_IDS.includes(id),
);

export const WILDCARD_AURA_IDS = GRANTABLE_AURA_IDS.filter((id) => !UNIQUE_AURA_IDS.includes(id));

export const WILDCARD_DICE_SKIN_IDS = GRANTABLE_DICE_SKIN_IDS.filter(
  (id) => !UNIQUE_DICE_SKIN_IDS.includes(id),
);

export const BASE_CHARACTER_SLOTS = 3;
export const BASE_PORTRAIT_GENERATIONS_PER_DAY = 5;
export const PORTRAIT_USAGE_KIND = 'portrait_gen';

/** Учётки до этой даты считаются первопроходцами (публичный запуск). */
export const DEFAULT_ALPHA_CUTOFF_ISO = '2026-10-01T00:00:00.000Z';

export type BadgeGrantSpec = {
  badgeType: RewardBadgeTypeId;
  customDiceSkinId: DiceSkinId | null;
  bonusCharacterSlots: number;
  bonusPortraitGenerationsPerDay: number;
};

export const BADGE_GRANT_SPECS: Record<RewardBadgeTypeId, BadgeGrantSpec> = {
  alpha_tester: {
    badgeType: 'alpha_tester',
    customDiceSkinId: 'alpha_pioneer',
    bonusCharacterSlots: 2,
    bonusPortraitGenerationsPerDay: 5,
  },
  bug_hunter: {
    badgeType: 'bug_hunter',
    customDiceSkinId: 'neon_glitch',
    bonusCharacterSlots: 1,
    bonusPortraitGenerationsPerDay: 3,
  },
  founding_dm: {
    badgeType: 'founding_dm',
    customDiceSkinId: 'founding_obsidian',
    bonusCharacterSlots: 3,
    bonusPortraitGenerationsPerDay: 10,
  },
  early_arrival: {
    badgeType: 'early_arrival',
    customDiceSkinId: null,
    bonusCharacterSlots: 0,
    bonusPortraitGenerationsPerDay: 0,
  },
  tavern_keeper: {
    badgeType: 'tavern_keeper',
    customDiceSkinId: 'tavern_oak',
    bonusCharacterSlots: 1,
    bonusPortraitGenerationsPerDay: 2,
  },
};

export function isRewardBadgeType(value: string): value is RewardBadgeTypeId {
  return (REWARD_BADGE_TYPES as readonly string[]).includes(value);
}

export function isDiceSkinId(value: string): value is DiceSkinId {
  return (DICE_SKIN_IDS as readonly string[]).includes(value);
}

export function isGrantableAvatarFrameId(value: string): value is GrantableAvatarFrameId {
  return (GRANTABLE_AVATAR_FRAME_IDS as readonly string[]).includes(value);
}

export function isGrantableAuraId(value: string): value is GrantableAuraId {
  return (GRANTABLE_AURA_IDS as readonly string[]).includes(value);
}

export function isGrantableDiceSkinId(value: string): value is Exclude<DiceSkinId, 'standard'> {
  return (GRANTABLE_DICE_SKIN_IDS as readonly string[]).includes(value);
}

export function isCosmeticKind(value: string): value is CosmeticKind {
  return (COSMETIC_KINDS as readonly string[]).includes(value);
}

export function exclusiveDiceSkinId(value: string | null | undefined): DiceSkinId | null {
  if (!value || value === 'standard' || !isDiceSkinId(value)) {
    return null;
  }
  return value;
}
