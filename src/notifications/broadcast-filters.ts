import { Prisma } from '@prisma/client';

/**
 * - everyone — все аккаунты без исключения (пользователи + гости)
 * - registered / all — только зарегистрированные (без гостей); `all` = legacy alias
 * - guests — только гости
 * - filtered — зарегистрированные + доп. фильтры
 */
export type BroadcastAudience =
  | 'everyone'
  | 'registered'
  | 'guests'
  | 'filtered'
  | 'all';

/**
 * Recipient filters for mass announcements.
 */
export type BroadcastFilters = {
  audience?: BroadcastAudience;
  /** true = only verified email; false = only unverified; omit = any */
  emailVerified?: boolean | null;
  /** User.roles has any of these (e.g. master, player) */
  rolesAny?: string[] | null;
  playsOnline?: boolean | null;
  prefersFreeOnly?: boolean | null;
  /** Has cityId or userCities */
  hasLocation?: boolean | null;
  cityId?: string | null;
  /** lastSeenAt within N days */
  lastSeenWithinDays?: number | null;
  /** createdAt within N days */
  registeredWithinDays?: number | null;
  /** Has at least one push subscription */
  hasPushSubscription?: boolean | null;
  /** questionnaireStep >= N (default 0 = ignore) */
  minQuestionnaireStep?: number | null;
};

export type BroadcastChannels = {
  inApp?: boolean;
  push?: boolean;
};

function normalizeAudience(raw: unknown): BroadcastAudience {
  const value = String(raw ?? 'registered').toLowerCase();
  if (value === 'everyone' || value === 'all_accounts' || value === 'including_guests') {
    return 'everyone';
  }
  if (value === 'guests' || value === 'guest') {
    return 'guests';
  }
  if (value === 'filtered') {
    return 'filtered';
  }
  // `all` kept as registered-only for backward compatibility with saved campaigns
  if (value === 'all' || value === 'registered' || value === 'users') {
    return 'registered';
  }
  return 'registered';
}

export function normalizeBroadcastFilters(
  raw: unknown,
): BroadcastFilters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { audience: 'registered' };
  }
  const input = raw as Record<string, unknown>;
  const audience = normalizeAudience(input.audience);

  const asBool = (v: unknown): boolean | null | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'any' || s === 'all') return undefined;
    if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
    return undefined;
  };

  const asInt = (v: unknown): number | null | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
  };

  const rolesRaw = input.rolesAny ?? input.roles;
  let rolesAny: string[] | null | undefined;
  if (Array.isArray(rolesRaw)) {
    rolesAny = rolesRaw.map((r) => String(r).trim()).filter(Boolean);
  } else if (typeof rolesRaw === 'string' && rolesRaw.trim()) {
    rolesAny = rolesRaw
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }

  return {
    audience,
    emailVerified: asBool(input.emailVerified),
    rolesAny: rolesAny?.length ? rolesAny : undefined,
    playsOnline: asBool(input.playsOnline),
    prefersFreeOnly: asBool(input.prefersFreeOnly),
    hasLocation: asBool(input.hasLocation),
    cityId:
      typeof input.cityId === 'string' && input.cityId.trim()
        ? input.cityId.trim()
        : undefined,
    lastSeenWithinDays: asInt(input.lastSeenWithinDays),
    registeredWithinDays: asInt(input.registeredWithinDays),
    hasPushSubscription: asBool(input.hasPushSubscription),
    minQuestionnaireStep: asInt(input.minQuestionnaireStep),
  };
}

export function buildRecipientWhere(
  filters: BroadcastFilters,
): Prisma.UserWhereInput {
  const audience = filters.audience ?? 'registered';

  if (audience === 'everyone') {
    return {};
  }

  if (audience === 'guests') {
    return { isGuest: true };
  }

  const where: Prisma.UserWhereInput = {
    isGuest: false,
  };

  if (audience !== 'filtered') {
    return where;
  }

  if (filters.emailVerified === true) {
    where.emailVerifiedAt = { not: null };
  } else if (filters.emailVerified === false) {
    where.emailVerifiedAt = null;
  }

  if (filters.rolesAny?.length) {
    where.roles = { hasSome: filters.rolesAny };
  }

  if (filters.playsOnline === true || filters.playsOnline === false) {
    where.playsOnline = filters.playsOnline;
  }

  if (filters.prefersFreeOnly === true || filters.prefersFreeOnly === false) {
    where.prefersFreeOnly = filters.prefersFreeOnly;
  }

  if (filters.cityId) {
    where.OR = [
      { cityId: filters.cityId },
      { userCities: { some: { cityId: filters.cityId } } },
    ];
  } else if (filters.hasLocation === true) {
    where.OR = [
      { cityId: { not: null } },
      { userCities: { some: {} } },
      { playsOnline: true },
    ];
  } else if (filters.hasLocation === false) {
    where.AND = [
      { cityId: null },
      { userCities: { none: {} } },
      { playsOnline: false },
    ];
  }

  if (
    filters.lastSeenWithinDays != null &&
    filters.lastSeenWithinDays > 0
  ) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - filters.lastSeenWithinDays);
    where.lastSeenAt = { gte: since };
  }

  if (
    filters.registeredWithinDays != null &&
    filters.registeredWithinDays > 0
  ) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - filters.registeredWithinDays);
    where.createdAt = { gte: since };
  }

  if (filters.hasPushSubscription === true) {
    where.pushSubscriptions = { some: {} };
  } else if (filters.hasPushSubscription === false) {
    where.pushSubscriptions = { none: {} };
  }

  if (
    filters.minQuestionnaireStep != null &&
    filters.minQuestionnaireStep > 0
  ) {
    where.questionnaireStep = { gte: filters.minQuestionnaireStep };
  }

  return where;
}
