import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RewardBadgeType, UserReward } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_COSMETIC_ITEM_ID,
  AURA_BY_BADGE,
  BADGE_DISPLAY_PRIORITY,
  BADGE_GRANT_SPECS,
  BASE_CHARACTER_SLOTS,
  BASE_PORTRAIT_GENERATIONS_PER_DAY,
  COSMETIC_KIND_ALL,
  COSMETIC_KIND_AURA,
  COSMETIC_KIND_AVATAR_FRAME,
  COSMETIC_KIND_DICE_SKIN,
  COSMETIC_KINDS,
  DEFAULT_ALPHA_CUTOFF_ISO,
  exclusiveDiceSkinId,
  FRAME_BY_BADGE,
  GRANTABLE_AURA_IDS,
  GRANTABLE_AVATAR_FRAME_IDS,
  GRANTABLE_DICE_SKIN_IDS,
  WILDCARD_AURA_IDS,
  WILDCARD_AVATAR_FRAME_IDS,
  WILDCARD_DICE_SKIN_IDS,
  isCosmeticKind,
  isDiceSkinId,
  isGrantableAuraId,
  isGrantableAvatarFrameId,
  isGrantableDiceSkinId,
  isRewardBadgeType,
  PORTRAIT_USAGE_KIND,
  type CosmeticKind,
  type DiceSkinId,
  type RewardBadgeTypeId,
} from './rewards.constants';
import type {
  AccountLimitsDto,
  CosmeticUnlockDto,
  GrantAlphaResultDto,
  GrantRewardResultDto,
  MyRewardsDto,
  UnlockCosmeticResultDto,
  UnlockedPerksDto,
  UserRewardDto,
} from './rewards.types';

const COSMETIC_OFF = 'none';

type EquippedCosmetics = {
  equippedAvatarFrameId?: string | null;
  equippedQuestionnaireAuraId?: string | null;
  visibleBadgeTypes?: unknown;
};

type CosmeticState = EquippedCosmetics & {
  unlocks: CosmeticUnlockDto[];
};

export type UserLookDto = {
  badges: RewardBadgeTypeId[];
  avatarFrameId: string | null;
};

function applyUnlocks(
  ids: Set<string>,
  unlocks: CosmeticUnlockDto[],
  kind: CosmeticKind,
  catalog: readonly string[],
  wildcardCatalog: readonly string[],
  isValid: (id: string) => boolean,
): Set<string> {
  const rows = unlocks.filter((item) => item.kind === kind);
  if (rows.some((item) => item.itemId === ALL_COSMETIC_ITEM_ID)) {
    for (const id of wildcardCatalog) {
      ids.add(id);
    }
  }
  for (const item of rows) {
    if (item.itemId === ALL_COSMETIC_ITEM_ID) {
      continue;
    }
    if (isValid(item.itemId) && catalog.includes(item.itemId)) {
      ids.add(item.itemId);
    }
  }
  return ids;
}

function unlocksAllOfKind(unlocks: CosmeticUnlockDto[], kind: CosmeticKind): boolean {
  return unlocks.some((item) => item.kind === kind && item.itemId === ALL_COSMETIC_ITEM_ID);
}

function ownedFrameIds(
  badges: RewardBadgeTypeId[],
  unlocks: CosmeticUnlockDto[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const badge of badges) {
    const frameId = FRAME_BY_BADGE[badge];
    if (frameId) {
      ids.add(frameId);
    }
  }
  return applyUnlocks(
    ids,
    unlocks,
    COSMETIC_KIND_AVATAR_FRAME,
    GRANTABLE_AVATAR_FRAME_IDS,
    WILDCARD_AVATAR_FRAME_IDS,
    isGrantableAvatarFrameId,
  );
}

function ownedAuraIds(
  badges: RewardBadgeTypeId[],
  unlocks: CosmeticUnlockDto[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const badge of badges) {
    const auraId = AURA_BY_BADGE[badge];
    if (auraId) {
      ids.add(auraId);
    }
  }
  return applyUnlocks(
    ids,
    unlocks,
    COSMETIC_KIND_AURA,
    GRANTABLE_AURA_IDS,
    WILDCARD_AURA_IDS,
    isGrantableAuraId,
  );
}

function ownedDiceSkinIds(
  rewards: UserRewardDto[],
  unlocks: CosmeticUnlockDto[] = [],
): Set<DiceSkinId> {
  const ids = new Set<string>(['standard']);
  for (const reward of rewards) {
    const skin = exclusiveDiceSkinId(reward.customDiceSkinId);
    if (skin) {
      ids.add(skin);
    }
  }
  applyUnlocks(
    ids,
    unlocks,
    COSMETIC_KIND_DICE_SKIN,
    GRANTABLE_DICE_SKIN_IDS,
    WILDCARD_DICE_SKIN_IDS,
    isGrantableDiceSkinId,
  );
  const owned = new Set<DiceSkinId>(['standard']);
  for (const id of ids) {
    if (isDiceSkinId(id)) {
      owned.add(id);
    }
  }
  return owned;
}

function defaultCosmeticFromBadges(
  badges: RewardBadgeTypeId[],
  owned: Set<string>,
  byBadge: Record<RewardBadgeTypeId, string | null>,
): string | null {
  for (const badge of BADGE_DISPLAY_PRIORITY) {
    if (!badges.includes(badge)) {
      continue;
    }
    const id = byBadge[badge];
    if (id && owned.has(id)) {
      return id;
    }
  }
  return null;
}

/**
 * Explicit `none` stays off. Empty/unknown equipped → best owned badge cosmetic.
 */
function resolveEquipped(
  equipped: string | null | undefined,
  owned: Set<string>,
  badges: RewardBadgeTypeId[],
  byBadge: Record<RewardBadgeTypeId, string | null>,
): string | null {
  if (equipped === COSMETIC_OFF) {
    return null;
  }
  if (equipped && owned.has(equipped)) {
    return equipped;
  }
  return defaultCosmeticFromBadges(badges, owned, byBadge);
}

function parseStoredBadgeTypes(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function resolveVisibleBadges(
  owned: RewardBadgeTypeId[],
  stored: string[] | null | undefined,
): RewardBadgeTypeId[] {
  if (stored == null) {
    return owned;
  }
  const allowed = new Set(owned);
  return stored.filter((item): item is RewardBadgeTypeId => allowed.has(item as RewardBadgeTypeId));
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getMyRewards(userId: string): Promise<MyRewardsDto> {
    const [rewards, cosmetics] = await Promise.all([
      this.listRewards(userId),
      this.getCosmeticState(userId),
    ]);
    const perks = this.buildPerks(rewards, cosmetics, cosmetics.unlocks);
    const limits = await this.getAccountLimits(userId, perks);
    return { rewards, perks, limits };
  }

  async updateCosmetics(
    userId: string,
    dto: {
      avatarFrameId?: string | null;
      questionnaireAuraId?: string | null;
      badgeTypes?: string[];
    },
  ): Promise<MyRewardsDto> {
    const [rewards, cosmetics] = await Promise.all([
      this.listRewards(userId),
      this.getCosmeticState(userId),
    ]);
    const badges = rewards.map((item) => item.badgeType);
    const frames = ownedFrameIds(badges, cosmetics.unlocks);
    const auras = ownedAuraIds(badges, cosmetics.unlocks);
    const data: {
      equippedAvatarFrameId?: string;
      equippedQuestionnaireAuraId?: string;
      visibleBadgeTypes?: RewardBadgeTypeId[];
    } = {};

    if (dto.avatarFrameId !== undefined) {
      const value = dto.avatarFrameId;
      if (value === null || value === COSMETIC_OFF) {
        data.equippedAvatarFrameId = COSMETIC_OFF;
      } else if (frames.has(value)) {
        data.equippedAvatarFrameId = value;
      } else {
        throw new BadRequestException('Этой рамки у тебя нет');
      }
    }

    if (dto.questionnaireAuraId !== undefined) {
      const value = dto.questionnaireAuraId;
      if (value === null || value === COSMETIC_OFF) {
        data.equippedQuestionnaireAuraId = COSMETIC_OFF;
      } else if (auras.has(value)) {
        data.equippedQuestionnaireAuraId = value;
      } else {
        throw new BadRequestException('Этого выделения у тебя нет');
      }
    }

    if (dto.badgeTypes !== undefined) {
      const owned = new Set(badges);
      data.visibleBadgeTypes = dto.badgeTypes.filter(
        (item): item is RewardBadgeTypeId => isRewardBadgeType(item) && owned.has(item),
      );
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data,
      });
    }

    return this.getMyRewards(userId);
  }

  async listRewards(userId: string): Promise<UserRewardDto[]> {
    const rows = await this.prisma.userReward.findMany({
      where: { userId },
      orderBy: { grantedAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async getBadgeTypesForUsers(
    userIds: string[],
  ): Promise<Map<string, RewardBadgeTypeId[]>> {
    const map = new Map<string, RewardBadgeTypeId[]>();
    if (userIds.length === 0) {
      return map;
    }

    const uniqueIds = [...new Set(userIds)];
    const rows = await this.prisma.userReward.findMany({
      where: { userId: { in: uniqueIds } },
      select: { userId: true, badgeType: true },
      orderBy: { grantedAt: 'asc' },
    });

    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push(row.badgeType);
      map.set(row.userId, list);
    }

    return map;
  }

  async getBadgeTypes(userId: string): Promise<RewardBadgeTypeId[]> {
    const map = await this.getBadgeTypesForUsers([userId]);
    return map.get(userId) ?? [];
  }

  async getLooksForUsers(userIds: string[]): Promise<Map<string, UserLookDto>> {
    const map = new Map<string, UserLookDto>();
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    for (const id of uniqueIds) {
      map.set(id, { badges: [], avatarFrameId: null });
    }
    if (uniqueIds.length === 0) {
      return map;
    }

    const [rows, users, unlocks] = await Promise.all([
      this.prisma.userReward.findMany({
        where: { userId: { in: uniqueIds } },
        select: { userId: true, badgeType: true },
        orderBy: { grantedAt: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          equippedAvatarFrameId: true,
          visibleBadgeTypes: true,
        },
      }),
      this.prisma.userCosmeticUnlock.findMany({
        where: { userId: { in: uniqueIds } },
        select: { userId: true, kind: true, itemId: true },
      }),
    ]);

    const badgesByUser = new Map<string, RewardBadgeTypeId[]>();
    for (const row of rows) {
      const list = badgesByUser.get(row.userId) ?? [];
      list.push(row.badgeType);
      badgesByUser.set(row.userId, list);
    }
    const lookByUser = new Map(
      users.map((user) => [
        user.id,
        {
          equippedAvatarFrameId: user.equippedAvatarFrameId,
          visibleBadgeTypes: user.visibleBadgeTypes,
        },
      ]),
    );
    const unlocksByUser = new Map<string, CosmeticUnlockDto[]>();
    for (const row of unlocks) {
      const list = unlocksByUser.get(row.userId) ?? [];
      list.push({ kind: row.kind, itemId: row.itemId });
      unlocksByUser.set(row.userId, list);
    }

    for (const id of uniqueIds) {
      const badges = badgesByUser.get(id) ?? [];
      const look = lookByUser.get(id);
      const userUnlocks = unlocksByUser.get(id) ?? [];
      map.set(id, {
        badges: resolveVisibleBadges(badges, parseStoredBadgeTypes(look?.visibleBadgeTypes)),
        avatarFrameId: resolveEquipped(
          look?.equippedAvatarFrameId ?? null,
          ownedFrameIds(badges, userUnlocks),
          badges,
          FRAME_BY_BADGE,
        ),
      });
    }

    return map;
  }

  buildPerks(
    rewards: UserRewardDto[],
    equipped?: EquippedCosmetics,
    unlocks: CosmeticUnlockDto[] = [],
  ): UnlockedPerksDto {
    const badges = rewards.map((item) => item.badgeType);
    let bonusCharacterSlots = 0;
    let bonusPortraitGenerationsPerDay = 0;

    for (const reward of rewards) {
      const spec = BADGE_GRANT_SPECS[reward.badgeType];
      bonusCharacterSlots += reward.bonusCharacterSlots;
      bonusPortraitGenerationsPerDay += spec.bonusPortraitGenerationsPerDay;
    }

    const frames = ownedFrameIds(badges, unlocks);
    const auras = ownedAuraIds(badges, unlocks);
    const diceSkinIds = ownedDiceSkinIds(rewards, unlocks);
    return {
      badges,
      diceSkinIds: [...diceSkinIds],
      bonusCharacterSlots,
      bonusPortraitGenerationsPerDay,
      avatarFrameId: resolveEquipped(
        equipped?.equippedAvatarFrameId,
        frames,
        badges,
        FRAME_BY_BADGE,
      ),
      questionnaireAuraId: resolveEquipped(
        equipped?.equippedQuestionnaireAuraId,
        auras,
        badges,
        AURA_BY_BADGE,
      ),
      visibleBadges: resolveVisibleBadges(badges, parseStoredBadgeTypes(equipped?.visibleBadgeTypes)),
      ownedFrameIds: GRANTABLE_AVATAR_FRAME_IDS.filter((id) => frames.has(id)),
      ownedAuraIds: GRANTABLE_AURA_IDS.filter((id) => auras.has(id)),
      unlockAllAvatarFrames: unlocksAllOfKind(unlocks, COSMETIC_KIND_AVATAR_FRAME),
      unlockAllAuras: unlocksAllOfKind(unlocks, COSMETIC_KIND_AURA),
      unlockAllDiceSkins: unlocksAllOfKind(unlocks, COSMETIC_KIND_DICE_SKIN),
    };
  }

  private async getCosmeticState(userId: string): Promise<CosmeticState> {
    const [user, unlocks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          equippedAvatarFrameId: true,
          equippedQuestionnaireAuraId: true,
          visibleBadgeTypes: true,
        },
      }),
      this.prisma.userCosmeticUnlock.findMany({
        where: { userId },
        select: { kind: true, itemId: true },
      }),
    ]);
    return {
      equippedAvatarFrameId: user?.equippedAvatarFrameId ?? null,
      equippedQuestionnaireAuraId: user?.equippedQuestionnaireAuraId ?? null,
      visibleBadgeTypes: user?.visibleBadgeTypes ?? null,
      unlocks,
    };
  }

  async getAccountLimits(
    userId: string,
    perks?: UnlockedPerksDto,
  ): Promise<AccountLimitsDto> {
    const resolved = perks ?? this.buildPerks(await this.listRewards(userId));
    const used = await this.getPortraitUsageToday(userId);
    const dailyPortraitGenerations =
      BASE_PORTRAIT_GENERATIONS_PER_DAY + resolved.bonusPortraitGenerationsPerDay;
    return {
      maxActiveCharacters: BASE_CHARACTER_SLOTS + resolved.bonusCharacterSlots,
      dailyPortraitGenerations,
      usedPortraitGenerationsToday: used,
      remainingPortraitGenerations: Math.max(0, dailyPortraitGenerations - used),
    };
  }

  async assertCharacterSlotAvailable(userId: string, activeCount: number) {
    const limits = await this.getAccountLimits(userId);
    if (activeCount >= limits.maxActiveCharacters) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: `Лимит персонажей: ${limits.maxActiveCharacters}`,
          maxActiveCharacters: limits.maxActiveCharacters,
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return limits;
  }

  async consumePortraitGeneration(userId: string) {
    const limits = await this.getAccountLimits(userId);
    if (limits.remainingPortraitGenerations <= 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `На сегодня портреты закончились (${limits.dailyPortraitGenerations})`,
          dailyPortraitGenerations: limits.dailyPortraitGenerations,
          usedPortraitGenerationsToday: limits.usedPortraitGenerationsToday,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const day = this.todayUtcDate();
    await this.prisma.dailyUsageCounter.upsert({
      where: {
        userId_kind_day: {
          userId,
          kind: PORTRAIT_USAGE_KIND,
          day,
        },
      },
      create: {
        userId,
        kind: PORTRAIT_USAGE_KIND,
        day,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    });

    return {
      ...limits,
      usedPortraitGenerationsToday: limits.usedPortraitGenerationsToday + 1,
      remainingPortraitGenerations: limits.remainingPortraitGenerations - 1,
    };
  }

  async resolveOwnedDiceSkin(
    userId: string,
    requested: string | null | undefined,
  ): Promise<DiceSkinId | null> {
    if (!requested || requested === 'standard' || !isDiceSkinId(requested)) {
      return exclusiveDiceSkinId(requested);
    }

    const rewards = await this.listRewards(userId);
    const cosmetics = await this.getCosmeticState(userId);
    const perks = this.buildPerks(rewards, cosmetics, cosmetics.unlocks);
    if (!perks.diceSkinIds.includes(requested)) {
      return null;
    }
    return requested;
  }

  async grantReward(
    userId: string,
    badgeType: RewardBadgeType,
  ): Promise<GrantRewardResultDto> {
    if (!isRewardBadgeType(badgeType)) {
      throw new BadRequestException('Неизвестный тип награды');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const spec = BADGE_GRANT_SPECS[badgeType];
    const existing = await this.prisma.userReward.findUnique({
      where: { userId_badgeType: { userId, badgeType } },
    });
    if (existing) {
      await this.unlockBadgeCosmetics(userId, badgeType);
      return { created: false, reward: this.toDto(existing) };
    }

    const created = await this.prisma.userReward.create({
      data: {
        userId,
        badgeType,
        customDiceSkinId: spec.customDiceSkinId,
        bonusCharacterSlots: spec.bonusCharacterSlots,
      },
    });

    await this.unlockBadgeCosmetics(userId, badgeType);

    return { created: true, reward: this.toDto(created) };
  }

  async unlockFrame(
    userId: string,
    input: { frameId?: string; all?: boolean },
  ): Promise<UnlockCosmeticResultDto> {
    return this.unlockCosmetic(userId, {
      kind: COSMETIC_KIND_AVATAR_FRAME,
      itemId: input.frameId,
      all: input.all,
    });
  }

  async unlockCosmetic(
    userId: string,
    input: { kind: string; itemId?: string; all?: boolean },
  ): Promise<UnlockCosmeticResultDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const kind = input.kind?.trim() ?? '';
    if (kind === COSMETIC_KIND_ALL || (input.all && !kind)) {
      let created = false;
      for (const cosmeticKind of COSMETIC_KINDS) {
        const didCreate = await this.upsertCosmeticUnlock(
          userId,
          cosmeticKind,
          ALL_COSMETIC_ITEM_ID,
        );
        created = created || didCreate;
      }
      return { created, kind: COSMETIC_KIND_ALL, all: true, itemId: ALL_COSMETIC_ITEM_ID };
    }

    if (!isCosmeticKind(kind)) {
      throw new BadRequestException('Неизвестный тип косметики');
    }

    if (input.all) {
      const created = await this.upsertCosmeticUnlock(userId, kind, ALL_COSMETIC_ITEM_ID);
      return { created, kind, all: true, itemId: ALL_COSMETIC_ITEM_ID };
    }

    const itemId = input.itemId?.trim() ?? '';
    if (!this.isGrantableCosmeticItem(kind, itemId)) {
      throw new BadRequestException('Укажи itemId или all: true');
    }

    const created = await this.upsertCosmeticUnlock(userId, kind, itemId);
    return { created, kind, all: false, itemId };
  }

  private isGrantableCosmeticItem(kind: CosmeticKind, itemId: string): boolean {
    if (kind === COSMETIC_KIND_AVATAR_FRAME) {
      return isGrantableAvatarFrameId(itemId);
    }
    if (kind === COSMETIC_KIND_AURA) {
      return isGrantableAuraId(itemId);
    }
    return isGrantableDiceSkinId(itemId);
  }

  private async unlockBadgeCosmetics(userId: string, badgeType: RewardBadgeTypeId) {
    const frameId = FRAME_BY_BADGE[badgeType];
    if (frameId) {
      await this.upsertCosmeticUnlock(userId, COSMETIC_KIND_AVATAR_FRAME, frameId);
    }
    const auraId = AURA_BY_BADGE[badgeType];
    if (auraId) {
      await this.upsertCosmeticUnlock(userId, COSMETIC_KIND_AURA, auraId);
    }
    const skinId = exclusiveDiceSkinId(BADGE_GRANT_SPECS[badgeType].customDiceSkinId);
    if (skinId) {
      await this.upsertCosmeticUnlock(userId, COSMETIC_KIND_DICE_SKIN, skinId);
    }
  }

  private async upsertCosmeticUnlock(
    userId: string,
    kind: string,
    itemId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.userCosmeticUnlock.findUnique({
      where: { userId_kind_itemId: { userId, kind, itemId } },
      select: { id: true },
    });
    if (existing) {
      return false;
    }
    try {
      await this.prisma.userCosmeticUnlock.create({
        data: { userId, kind, itemId },
      });
      return true;
    } catch {
      return false;
    }
  }

  async grantAlphaTesters(cutoffRaw?: string): Promise<GrantAlphaResultDto> {
    const cutoff = this.resolveCutoff(cutoffRaw);
    const users = await this.prisma.user.findMany({
      where: {
        isGuest: false,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    let granted = 0;
    let skipped = 0;
    for (const user of users) {
      const result = await this.grantReward(user.id, 'alpha_tester');
      if (result.created) {
        granted += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      cutoff: cutoff.toISOString(),
      scanned: users.length,
      granted,
      skipped,
    };
  }

  private async getPortraitUsageToday(userId: string): Promise<number> {
    const row = await this.prisma.dailyUsageCounter.findUnique({
      where: {
        userId_kind_day: {
          userId,
          kind: PORTRAIT_USAGE_KIND,
          day: this.todayUtcDate(),
        },
      },
      select: { count: true },
    });
    return row?.count ?? 0;
  }

  private todayUtcDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private resolveCutoff(raw?: string): Date {
    const value =
      raw?.trim() ||
      this.config.get<string>('ALPHA_TESTER_CUTOFF')?.trim() ||
      DEFAULT_ALPHA_CUTOFF_ISO;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректная дата отсечки альфы');
    }
    return parsed;
  }

  private toDto(row: UserReward): UserRewardDto {
    return {
      id: row.id,
      userId: row.userId,
      badgeType: row.badgeType,
      customDiceSkinId: row.customDiceSkinId,
      bonusCharacterSlots: row.bonusCharacterSlots,
      grantedAt: row.grantedAt,
    };
  }
}
