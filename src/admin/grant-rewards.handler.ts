import { HttpException } from '@nestjs/common';
import type { RewardBadgeType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_COSMETIC_ITEM_ID,
  COSMETIC_KIND_ALL,
  isRewardBadgeType,
} from '../rewards/rewards.constants';
import { RewardsService } from '../rewards/rewards.service';
import { BADGE_LABELS, buildGrantCatalog, COSMETIC_KIND_LABELS } from './rewards-catalog';

type AdminRequest = {
  method?: string;
  query?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0].trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function payloadOf(request: AdminRequest): Record<string, unknown> {
  return request.payload ?? request.body ?? {};
}

export function adminErrorMessage(error: unknown, fallback = 'Не получилось'): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string' && response.trim()) {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.filter(Boolean).join(', ') || fallback;
      }
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function pickUserId(payload: Record<string, unknown>): string {
  return asString(payload.user ?? payload.userId);
}

export function pickBadgeTypes(payload: Record<string, unknown>): string[] {
  const raw = payload.badgeTypes ?? payload.badgeType;
  const values = Array.isArray(raw)
    ? raw.map((item) => asString(item))
    : asString(raw)
        .split(',')
        .map((item) => item.trim());
  return [...new Set(values.filter((item) => isRewardBadgeType(item)))];
}

export type AdminUserHit = {
  id: string;
  nickname: string;
  email: string;
  isGuest: boolean;
  label: string;
};

export async function searchUsers(prisma: PrismaService, query: string): Promise<AdminUserHit[]> {
  const trimmed = query.trim();
  const users = await prisma.user.findMany({
    where: trimmed
      ? {
          OR: [
            { nickname: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
            { id: trimmed },
          ],
        }
      : undefined,
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: { id: true, nickname: true, email: true, isGuest: true },
  });
  return users.map((user) => ({
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    isGuest: user.isGuest,
    label: user.isGuest
      ? `${user.nickname} · ${user.email} · гость`
      : `${user.nickname} · ${user.email}`,
  }));
}

export function toUserSearchRecords(users: AdminUserHit[]) {
  return users.map((user) => ({
    id: user.id,
    title: user.label,
    params: {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      isGuest: user.isGuest,
    },
    populated: {},
    errors: {},
    recordActions: [],
    bulkActions: [],
    baseError: null,
  }));
}

async function getUserState(rewards: RewardsService, userId: string) {
  const mine = await rewards.getMyRewards(userId);
  return {
    badges: mine.perks.badges.map((badge) => ({
      value: badge,
      label: BADGE_LABELS[badge] ?? badge,
    })),
    frames: mine.perks.ownedFrameIds,
    auras: mine.perks.ownedAuraIds,
    dice: mine.perks.diceSkinIds.filter((id) => id !== 'standard'),
    unlockAllAvatarFrames: mine.perks.unlockAllAvatarFrames,
    unlockAllAuras: mine.perks.unlockAllAuras,
    unlockAllDiceSkins: mine.perks.unlockAllDiceSkins,
  };
}

export function createGrantRewardsPageHandler(prisma: PrismaService, rewards: RewardsService) {
  return async (request: AdminRequest) => {
    const method = String(request.method ?? 'get').toLowerCase();
    const query = request.query ?? {};
    const payload = payloadOf(request);

    if (method === 'get') {
      const search = asString(query.q);
      const userId = asString(query.userId);
      const listUsers = asString(query.users) === '1';
      if (listUsers || search) {
        return { users: await searchUsers(prisma, search) };
      }
      if (userId) {
        return { state: await getUserState(rewards, userId) };
      }
      return { catalog: buildGrantCatalog() };
    }

    if (method !== 'post') {
      return { notice: { message: 'Неизвестный запрос', type: 'error' } };
    }

    const action = asString(payload.action);
    const userId = pickUserId(payload);
    if (!userId) {
      return { notice: { message: 'Выбери игрока', type: 'error' } };
    }

    try {
      if (action === 'grantReward') {
        const badgeTypes = pickBadgeTypes(payload);
        if (badgeTypes.length === 0) {
          return { notice: { message: 'Выбери хотя бы одну награду', type: 'error' } };
        }
        const results = [];
        for (const badgeType of badgeTypes) {
          results.push(await rewards.grantReward(userId, badgeType as RewardBadgeType));
        }
        const created = results.filter((item) => item.created).length;
        const skipped = results.length - created;
        const state = await getUserState(rewards, userId);
        const grantedLabels = badgeTypes
          .map((item) => BADGE_LABELS[item as keyof typeof BADGE_LABELS] ?? item)
          .join(', ');
        let message = `Выдал: ${grantedLabels}`;
        if (created && skipped) {
          message = `Выдал ${created}, уже были ${skipped}: ${grantedLabels}`;
        } else if (!created) {
          message = `Уже было: ${grantedLabels}. Косметику подтянул ещё раз.`;
        }
        return {
          created: created > 0,
          state,
          notice: {
            message: created ? 'rewardGranted' : 'rewardAlreadyOwned',
            type: 'success',
            options: { defaultValue: message },
          },
        };
      }

      if (action === 'unlockCosmetic') {
        const kind = asString(payload.kind) || COSMETIC_KIND_ALL;
        const itemId = asString(payload.itemId);
        const all =
          asString(payload.all) === 'true' ||
          itemId === ALL_COSMETIC_ITEM_ID ||
          kind === COSMETIC_KIND_ALL;
        const result = await rewards.unlockCosmetic(userId, {
          kind,
          itemId: all ? undefined : itemId,
          all,
        });
        const state = await getUserState(rewards, userId);
        const kindLabel = COSMETIC_KIND_LABELS[result.kind] ?? result.kind;
        return {
          created: result.created,
          state,
          notice: {
            message: result.created ? 'cosmeticGranted' : 'cosmeticAlreadyOwned',
            type: 'success',
            options: { defaultValue: result.created ? `Выдал: ${kindLabel}` : `Уже было: ${kindLabel}` },
          },
        };
      }

      return { notice: { message: 'Неизвестное действие', type: 'error' } };
    } catch (error) {
      return { notice: { message: adminErrorMessage(error), type: 'error' } };
    }
  };
}

export async function handleGrantRewardRecordCreate(
  request: AdminRequest,
  context: { resource: any; h: any; currentAdmin?: unknown },
  rewards: RewardsService,
) {
  const { resource, h, currentAdmin } = context;
  if (String(request.method ?? '').toLowerCase() !== 'post') {
    const record = await resource.build({});
    return { record: record.toJSON(currentAdmin) };
  }

  const payload = payloadOf(request);
  const userId = pickUserId(payload);
  const badgeTypes = pickBadgeTypes(payload);

  try {
    if (!userId) {
      throw new Error('Выбери игрока');
    }
    if (badgeTypes.length === 0) {
      throw new Error('Выбери хотя бы одну награду');
    }
    const results = [];
    for (const badgeType of badgeTypes) {
      results.push(await rewards.grantReward(userId, badgeType as RewardBadgeType));
    }
    const created = results.filter((item) => item.created).length;
    const record = await resource.findOne(results[results.length - 1].reward.id);
    return {
      redirectUrl: h.resourceUrl({ resourceId: resource.id() }),
      notice: {
        message: created ? 'rewardGranted' : 'rewardAlreadyOwned',
        type: 'success',
      },
      record: record ? record.toJSON(currentAdmin) : await emptyRecord(resource, currentAdmin),
    };
  } catch (error) {
    const record = await resource.build(payload);
    return {
      record: record.toJSON(currentAdmin),
      notice: { message: adminErrorMessage(error), type: 'error' },
    };
  }
}

export async function handleUnlockCosmeticRecordCreate(
  request: AdminRequest,
  context: { resource: any; h: any; currentAdmin?: unknown },
  rewards: RewardsService,
  prisma: PrismaService,
) {
  const { resource, h, currentAdmin } = context;
  if (String(request.method ?? '').toLowerCase() !== 'post') {
    const record = await resource.build({});
    return { record: record.toJSON(currentAdmin) };
  }

  const payload = payloadOf(request);
  const userId = pickUserId(payload);
  const kind = asString(payload.kind);
  const itemId = asString(payload.itemId);
  const all = itemId === ALL_COSMETIC_ITEM_ID || kind === COSMETIC_KIND_ALL;

  try {
    if (!userId) {
      throw new Error('Выбери игрока');
    }
    const result = await rewards.unlockCosmetic(userId, {
      kind: kind || COSMETIC_KIND_ALL,
      itemId: all ? undefined : itemId,
      all,
    });
    const storedKind = result.kind === COSMETIC_KIND_ALL ? 'avatar_frame' : result.kind;
    const row = await prisma.userCosmeticUnlock.findUnique({
      where: {
        userId_kind_itemId: {
          userId,
          kind: storedKind,
          itemId: result.itemId,
        },
      },
      select: { id: true },
    });
    const record = row ? await resource.findOne(row.id) : await resource.build(payload);

    return {
      redirectUrl: h.resourceUrl({ resourceId: resource.id() }),
      notice: {
        message: result.created ? 'cosmeticGranted' : 'cosmeticAlreadyOwned',
        type: 'success',
      },
      record: record.toJSON(currentAdmin),
    };
  } catch (error) {
    const record = await resource.build(payload);
    return {
      record: record.toJSON(currentAdmin),
      notice: { message: adminErrorMessage(error), type: 'error' },
    };
  }
}

async function emptyRecord(resource: any, currentAdmin: unknown) {
  const record = await resource.build({});
  return record.toJSON(currentAdmin);
}
