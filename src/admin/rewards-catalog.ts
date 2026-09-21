import {
  ALL_COSMETIC_ITEM_ID,
  AURA_BY_BADGE,
  BADGE_GRANT_SPECS,
  COSMETIC_KIND_ALL,
  COSMETIC_KIND_AURA,
  COSMETIC_KIND_AVATAR_FRAME,
  COSMETIC_KIND_DICE_SKIN,
  FRAME_BY_BADGE,
  GRANTABLE_AURA_IDS,
  GRANTABLE_AVATAR_FRAME_IDS,
  GRANTABLE_DICE_SKIN_IDS,
  REWARD_BADGE_TYPES,
  type CosmeticKind,
  type RewardBadgeTypeId,
} from '../rewards/rewards.constants';

export type AdminOption = { value: string; label: string };

export const BADGE_LABELS: Record<RewardBadgeTypeId, string> = {
  alpha_tester: 'Alpha Pioneer',
  bug_hunter: 'Bug Hunter',
  founding_dm: 'Founding DM',
  early_arrival: 'First Wave',
  tavern_keeper: 'Хозяин таверны',
};

export const DICE_LABELS: Record<string, string> = {
  alpha_pioneer: 'Alpha Pioneer',
  neon_glitch: 'Neon Glitch',
  founding_obsidian: 'Founding Obsidian',
  tavern_oak: 'Дубовые',
};

export const FRAME_LABELS: Record<string, string> = {
  steel_band: 'First Wave',
  alpha_runes: 'Alpha Pioneer',
  neon_scan: 'Bug Hunter',
  founding_embers: 'Founding DM',
  solar_flare: 'Solar Flare',
  frost_ring: 'Frost Ring',
  hex_circuit: 'Hex Circuit',
  void_orbit: 'Void Orbit',
  sakura_fall: 'Сакура',
  storm_arc: 'Гроза',
  blood_moon: 'Багровая луна',
  prism_halo: 'Призма',
  pixel_spark: 'Пиксель',
  leaf_crown: 'Крона',
  tide_ring: 'Прилив',
  ghost_veil: 'Призрак',
  copper_gear: 'Шестерни',
  star_orbit: 'Созвездие',
  oak_tankard: 'Дубовый обод',
};

export const AURA_LABELS: Record<string, string> = {
  aurora: 'Северное сияние',
  neon_grid: 'Неоновая сетка',
  void_runes: 'Пламя основателя',
  sakura_mist: 'Сакура',
  storm_veil: 'Гроза',
  blood_haze: 'Багровая дымка',
  prism_shift: 'Призма',
  pixel_rain: 'Пиксельный дождь',
  forest_glow: 'Светлячки',
  tide_caustic: 'Каустика',
  ghost_fog: 'Туман',
  magma_flow: 'Магма',
  star_field: 'Звёздное поле',
  oak_shield: 'Дубовый щит',
};

export const COSMETIC_KIND_LABELS: Record<string, string> = {
  [COSMETIC_KIND_AVATAR_FRAME]: 'Рамка аватара',
  [COSMETIC_KIND_AURA]: 'Выделение анкеты',
  [COSMETIC_KIND_DICE_SKIN]: 'Скин кубиков',
  [COSMETIC_KIND_ALL]: 'Вся косметика',
};

export const BADGE_SELECT_OPTIONS: AdminOption[] = REWARD_BADGE_TYPES.map((value) => ({
  value,
  label: BADGE_LABELS[value],
}));

export const DICE_SELECT_OPTIONS: AdminOption[] = GRANTABLE_DICE_SKIN_IDS.map((value) => ({
  value,
  label: DICE_LABELS[value] ?? value,
}));

export const COSMETIC_KIND_SELECT_OPTIONS: AdminOption[] = [
  { value: COSMETIC_KIND_AVATAR_FRAME, label: COSMETIC_KIND_LABELS[COSMETIC_KIND_AVATAR_FRAME] },
  { value: COSMETIC_KIND_AURA, label: COSMETIC_KIND_LABELS[COSMETIC_KIND_AURA] },
  { value: COSMETIC_KIND_DICE_SKIN, label: COSMETIC_KIND_LABELS[COSMETIC_KIND_DICE_SKIN] },
  { value: COSMETIC_KIND_ALL, label: 'Всё сразу: рамки, ауры и кубики' },
];

function prefixedOptions(
  ids: readonly string[],
  labels: Record<string, string>,
  prefix: string,
): AdminOption[] {
  return ids.map((value) => ({
    value,
    label: `${prefix}${labels[value] ?? value}`,
  }));
}

export const COSMETIC_ITEM_SELECT_OPTIONS: AdminOption[] = [
  { value: ALL_COSMETIC_ITEM_ID, label: 'Все обычные, без уникальных с наград' },
  ...prefixedOptions(GRANTABLE_AVATAR_FRAME_IDS, FRAME_LABELS, 'Рамка: '),
  ...prefixedOptions(GRANTABLE_AURA_IDS, AURA_LABELS, 'Аура: '),
  ...prefixedOptions(GRANTABLE_DICE_SKIN_IDS, DICE_LABELS, 'Кубики: '),
];

export type CatalogCosmeticItem = AdminOption & { kind: CosmeticKind };

export const CATALOG_COSMETIC_ITEMS: CatalogCosmeticItem[] = [
  ...GRANTABLE_AVATAR_FRAME_IDS.map((value): CatalogCosmeticItem => ({
    value,
    kind: COSMETIC_KIND_AVATAR_FRAME,
    label: FRAME_LABELS[value] ?? value,
  })),
  ...GRANTABLE_AURA_IDS.map((value): CatalogCosmeticItem => ({
    value,
    kind: COSMETIC_KIND_AURA,
    label: AURA_LABELS[value] ?? value,
  })),
  ...GRANTABLE_DICE_SKIN_IDS.map((value): CatalogCosmeticItem => ({
    value,
    kind: COSMETIC_KIND_DICE_SKIN,
    label: DICE_LABELS[value] ?? value,
  })),
];

export type BadgeCatalogItem = {
  value: RewardBadgeTypeId;
  label: string;
  description: string;
};

export function describeBadgeGrant(badgeType: RewardBadgeTypeId): string {
  const spec = BADGE_GRANT_SPECS[badgeType];
  const parts = ['значок'];
  if (spec.customDiceSkinId) {
    parts.push(`кубики «${DICE_LABELS[spec.customDiceSkinId] ?? spec.customDiceSkinId}»`);
  }
  const frameId = FRAME_BY_BADGE[badgeType];
  if (frameId) {
    parts.push(`рамка «${FRAME_LABELS[frameId] ?? frameId}»`);
  }
  const auraId = AURA_BY_BADGE[badgeType];
  if (auraId) {
    parts.push(`аура «${AURA_LABELS[auraId] ?? auraId}»`);
  }
  if (spec.bonusCharacterSlots > 0) {
    parts.push(`+${spec.bonusCharacterSlots} слота персонажей`);
  }
  if (spec.bonusPortraitGenerationsPerDay > 0) {
    parts.push(`+${spec.bonusPortraitGenerationsPerDay} портретов в день`);
  }
  return parts.join(', ');
}

export const BADGE_CATALOG: BadgeCatalogItem[] = REWARD_BADGE_TYPES.map((value) => ({
  value,
  label: BADGE_LABELS[value],
  description: describeBadgeGrant(value),
}));

export function buildGrantCatalog() {
  return {
    badges: BADGE_CATALOG,
    cosmeticKinds: COSMETIC_KIND_SELECT_OPTIONS,
    cosmeticItems: CATALOG_COSMETIC_ITEMS,
    allItemId: ALL_COSMETIC_ITEM_ID,
  };
}
