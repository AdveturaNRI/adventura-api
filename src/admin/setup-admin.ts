import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import {
  ANALYTICS_EVENTS,
  DAILY_METRICS,
  ONLINE_WINDOW_MS,
} from '../analytics/analytics.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { loadEsmModule } from '../common/load-esm-module';
import type { PrismaService } from '../prisma/prisma.service';
import {
  buildQuestionnaireCompletionInput,
  isEligibleForWanderersFeed,
} from '../users/utils/questionnaire-completion.util';

type ChartRange = 'day' | 'week' | 'month' | 'year' | 'all';
type ChartBucket = 'hour' | 'day' | 'week' | 'month';

type ChartPoint = { t: string; v: number };

type ChartSeriesDef = {
  id: string;
  label: string;
  description: string;
  color: string;
  group: 'views' | 'transitions' | 'product' | 'metrics' | 'platform' | 'clubs' | 'funnel';
  defaultOn: boolean;
  /** Event names summed into this series (omit for daily-metric series). */
  eventNames?: readonly string[];
  /** Daily metric key from analytics_daily_metrics. */
  dailyMetric?: string;
  /** Prop on platform_snapshot events (hourly gauges). */
  snapshotProp?:
    | 'users_total'
    | 'profiles_active'
    | 'profiles_free_only'
    | 'users_online';
  /** Forward-fill gaps (stock gauges, not counters). */
  gauge?: boolean;
};

type ChartSeries = ChartSeriesDef & { points: ChartPoint[] };

type RangePayload = {
  key: ChartRange;
  label: string;
  bucket: ChartBucket;
  from: string;
  to: string;
  series: ChartSeries[];
};

const TRACKED_EVENT_NAMES = [
  ANALYTICS_EVENTS.CLUB_PAGE_VIEWED,
  ANALYTICS_EVENTS.PLAYER_PROFILE_VIEWED,
  ANALYTICS_EVENTS.GAME_LISTING_VIEWED,
  ANALYTICS_EVENTS.CLUB_PAGE_TRANSITION,
  ANALYTICS_EVENTS.PLAYER_PROFILE_TRANSITION,
  ANALYTICS_EVENTS.GAME_LISTING_TRANSITION,
  ANALYTICS_EVENTS.USER_REGISTERED,
  ANALYTICS_EVENTS.USER_SESSION_STARTED,
  ANALYTICS_EVENTS.USER_ROLE_SELECTED,
  ANALYTICS_EVENTS.PLAYER_PROFILE_CREATED,
  ANALYTICS_EVENTS.PLAYER_PROFILE_CONTACTED,
  ANALYTICS_EVENTS.PLAYER_MATCH_COMPLETED,
  ANALYTICS_EVENTS.GAME_LISTING_CREATED,
  ANALYTICS_EVENTS.GAME_APPLICATION_SENT,
  ANALYTICS_EVENTS.GAME_APPLICATION_APPROVED,
  ANALYTICS_EVENTS.GAME_APPLICATION_REJECTED,
  ANALYTICS_EVENTS.GAME_SESSION_STARTED,
  ANALYTICS_EVENTS.GAME_SESSION_COMPLETED,
  ANALYTICS_EVENTS.CLUB_PROFILE_CREATED,
  ANALYTICS_EVENTS.CLUB_PROFILE_UPDATED,
  ANALYTICS_EVENTS.CLUB_GAME_LINKED,
] as const;

const SERIES_DEFS: ChartSeriesDef[] = [
  {
    id: 'views_club',
    label: 'Просмотры · клубы',
    description:
      'Карточка клуба была видна ≥3 секунды (≥50% площади). Не более 1 записи на пользователя и клуб в час.',
    color: '#2563eb',
    group: 'views',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.CLUB_PAGE_VIEWED],
  },
  {
    id: 'views_player',
    label: 'Просмотры · игроки',
    description:
      'Карточка игрока в ленте/деке была видна ≥3 секунды. Не более 1 записи на пользователя и игрока в час.',
    color: '#7c3aed',
    group: 'views',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.PLAYER_PROFILE_VIEWED],
  },
  {
    id: 'views_game',
    label: 'Просмотры · игры',
    description:
      'Карточка набора/игры была видна ≥3 секунды. Не более 1 записи на пользователя и игру в час.',
    color: '#0891b2',
    group: 'views',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_LISTING_VIEWED],
  },
  {
    id: 'views_total',
    label: 'Просмотры · всего',
    description:
      'Сумма всех impression-просмотров: клубы + игроки + игры (видимость ≥3с, rate limit 1/час).',
    color: '#1d4ed8',
    group: 'views',
    defaultOn: true,
    eventNames: [
      ANALYTICS_EVENTS.CLUB_PAGE_VIEWED,
      ANALYTICS_EVENTS.PLAYER_PROFILE_VIEWED,
      ANALYTICS_EVENTS.GAME_LISTING_VIEWED,
    ],
  },
  {
    id: 'transitions_club',
    label: 'Переходы · клубы',
    description:
      'Открытие детальной страницы клуба. Не более 1 перехода на пользователя и клуб в час.',
    color: '#ea580c',
    group: 'transitions',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.CLUB_PAGE_TRANSITION],
  },
  {
    id: 'transitions_player',
    label: 'Переходы · игроки',
    description:
      'Открытие профиля игрока. Не более 1 перехода на пользователя и игрока в час.',
    color: '#c026d3',
    group: 'transitions',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.PLAYER_PROFILE_TRANSITION],
  },
  {
    id: 'transitions_game',
    label: 'Переходы · игры',
    description:
      'Открытие детальной страницы набора/игры. Не более 1 перехода на пользователя и игру в час.',
    color: '#d97706',
    group: 'transitions',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_LISTING_TRANSITION],
  },
  {
    id: 'transitions_total',
    label: 'Переходы · всего',
    description:
      'Сумма всех переходов в деталки: клубы + игроки + игры (rate limit 1/час).',
    color: '#c2410c',
    group: 'transitions',
    defaultOn: true,
    eventNames: [
      ANALYTICS_EVENTS.CLUB_PAGE_TRANSITION,
      ANALYTICS_EVENTS.PLAYER_PROFILE_TRANSITION,
      ANALYTICS_EVENTS.GAME_LISTING_TRANSITION,
    ],
  },
  {
    id: 'user_registered',
    label: 'Регистрации',
    description:
      'Новые регистрации пользователей (событие user_registered при успешной регистрации).',
    color: '#16a34a',
    group: 'product',
    defaultOn: true,
    eventNames: [ANALYTICS_EVENTS.USER_REGISTERED],
  },
  {
    id: 'user_session_started',
    label: 'Сессии',
    description:
      'Старты клиентских сессий (открытие/авторизация в приложении, user_session_started).',
    color: '#059669',
    group: 'product',
    defaultOn: true,
    eventNames: [ANALYTICS_EVENTS.USER_SESSION_STARTED],
  },
  {
    id: 'player_profile_created',
    label: 'Анкеты созданы',
    description:
      'Первое заполнение/создание анкеты игрока (player_profile_created).',
    color: '#65a30d',
    group: 'product',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.PLAYER_PROFILE_CREATED],
  },
  {
    id: 'game_listing_created',
    label: 'Наборы созданы',
    description:
      'Создание нового набора/листинга игры мастером (game_listing_created).',
    color: '#0d9488',
    group: 'product',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_LISTING_CREATED],
  },
  {
    id: 'game_application_sent',
    label: 'Заявки',
    description:
      'Отправка заявки игрока на набор (game_application_sent).',
    color: '#4f46e5',
    group: 'product',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_APPLICATION_SENT],
  },
  {
    id: 'player_match_completed',
    label: 'Матчи',
    description:
      'Зачисление игрока в состав после approve заявки (player_match_completed).',
    color: '#db2777',
    group: 'product',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.PLAYER_MATCH_COMPLETED],
  },
  {
    id: 'user_role_selected',
    label: 'Выбор роли',
    description: 'Смена/выбор ролей (player / gm / club_owner).',
    color: '#84cc16',
    group: 'product',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.USER_ROLE_SELECTED],
  },
  {
    id: 'player_profile_contacted',
    label: 'Контакты',
    description: 'Открытие чата / связь с игроком из анкеты.',
    color: '#f43f5e',
    group: 'funnel',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.PLAYER_PROFILE_CONTACTED],
  },
  {
    id: 'game_application_approved',
    label: 'Заявки · approve',
    description: 'Мастер принял заявку на набор.',
    color: '#22c55e',
    group: 'funnel',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_APPLICATION_APPROVED],
  },
  {
    id: 'game_application_rejected',
    label: 'Заявки · reject',
    description: 'Мастер отклонил заявку на набор.',
    color: '#ef4444',
    group: 'funnel',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_APPLICATION_REJECTED],
  },
  {
    id: 'game_session_started',
    label: 'Сессии игр · старт',
    description: 'Стол/набор перешёл в активную сессию (CLOSED и т.п.).',
    color: '#06b6d4',
    group: 'funnel',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_SESSION_STARTED],
  },
  {
    id: 'game_session_completed',
    label: 'Сессии игр · финиш',
    description: 'Игра завершена (FINISHED) — сыгранные партии.',
    color: '#0284c7',
    group: 'funnel',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.GAME_SESSION_COMPLETED],
  },
  {
    id: 'club_profile_created',
    label: 'Клубы · созданы',
    description: 'Регистрация клуба.',
    color: '#a855f7',
    group: 'clubs',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.CLUB_PROFILE_CREATED],
  },
  {
    id: 'club_profile_updated',
    label: 'Клубы · обновления',
    description: 'Обновление профиля клуба.',
    color: '#9333ea',
    group: 'clubs',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.CLUB_PROFILE_UPDATED],
  },
  {
    id: 'club_game_linked',
    label: 'Клубы · привязки игр',
    description: 'Набор привязан к клубу (локация).',
    color: '#7e22ce',
    group: 'clubs',
    defaultOn: false,
    eventNames: [ANALYTICS_EVENTS.CLUB_GAME_LINKED],
  },
  {
    id: 'users_total',
    label: 'Пользователи',
    description:
      'Снимок: всего зарегистрированных пользователей (без гостей).',
    color: '#0ea5e9',
    group: 'platform',
    defaultOn: true,
    dailyMetric: DAILY_METRICS.USERS_TOTAL,
    snapshotProp: 'users_total',
    gauge: true,
  },
  {
    id: 'profiles_active',
    label: 'Анкеты',
    description:
      'Снимок: публичные анкеты, годные для ленты странников.',
    color: '#8b5cf6',
    group: 'platform',
    defaultOn: true,
    dailyMetric: DAILY_METRICS.PROFILES_ACTIVE,
    snapshotProp: 'profiles_active',
    gauge: true,
  },
  {
    id: 'profiles_free_only',
    label: 'Анкеты · free only',
    description: 'Активные анкеты с prefersFreeOnly=true.',
    color: '#c084fc',
    group: 'platform',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.PROFILES_FREE_ONLY,
    snapshotProp: 'profiles_free_only',
    gauge: true,
  },
  {
    id: 'users_online',
    label: 'Онлайн',
    description:
      'Снимок: lastSeenAt за последние 15 минут (не websocket).',
    color: '#22c55e',
    group: 'platform',
    defaultOn: true,
    dailyMetric: DAILY_METRICS.USERS_ONLINE,
    snapshotProp: 'users_online',
    gauge: true,
  },
  {
    id: 'metric_dau',
    label: 'DAU',
    description: 'Уникальные userId с user_session_started за день.',
    color: '#0f766e',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.DAU,
    gauge: true,
  },
  {
    id: 'metric_wau',
    label: 'WAU',
    description: 'Уникальные сессии за скользящие 7 дней (на дату).',
    color: '#0e7490',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.WAU,
    gauge: true,
  },
  {
    id: 'metric_mau',
    label: 'MAU',
    description: 'Уникальные сессии за скользящие 30 дней (на дату).',
    color: '#155e75',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.MAU,
    gauge: true,
  },
  {
    id: 'metric_stickiness',
    label: 'Stickiness',
    description: 'DAU / WAU — коэффициент прилипаемости (0…1).',
    color: '#134e4a',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.STICKINESS,
    gauge: true,
  },
  {
    id: 'metric_retention_d1',
    label: 'Retention D1',
    description:
      'Доля зарегистрированных вчера, у кого была сессия сегодня (0…1).',
    color: '#b45309',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.RETENTION_D1,
    gauge: true,
  },
  {
    id: 'metric_retention_d7',
    label: 'Retention D7',
    description:
      'Доля зарегистрированных 7 дней назад с сессией сегодня (0…1).',
    color: '#c2410c',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.RETENTION_D7,
    gauge: true,
  },
  {
    id: 'metric_retention_d30',
    label: 'Retention D30',
    description:
      'Доля зарегистрированных 30 дней назад с сессией сегодня (0…1).',
    color: '#9a3412',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.RETENTION_D30,
    gauge: true,
  },
  {
    id: 'metric_match_rate',
    label: 'Match rate',
    description: 'matches / contacts за день (0…1).',
    color: '#be185d',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.MATCH_RATE,
    gauge: true,
  },
  {
    id: 'metric_time_to_match',
    label: 'Time to match (ms)',
    description: 'Среднее время от заявки до approve/матча за день.',
    color: '#9d174d',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.AVG_TIME_TO_MATCH_MS,
    gauge: true,
  },
  {
    id: 'metric_apply_approve_rate',
    label: 'Approve rate',
    description: 'approved / sent заявок за день (0…1).',
    color: '#15803d',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.APPLY_APPROVE_RATE,
    gauge: true,
  },
  {
    id: 'metric_liquidity',
    label: 'Liquidity',
    description: 'activeProfiles / openSeats.',
    color: '#7e22ce',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.LIQUIDITY,
    gauge: true,
  },
  {
    id: 'metric_sessions_created',
    label: 'Listings created',
    description: 'Созданные наборы за день (game_listing_created).',
    color: '#0369a1',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.SESSIONS_CREATED,
  },
  {
    id: 'metric_sessions_completed',
    label: 'Sessions completed',
    description: 'Завершённые игровые сессии за день.',
    color: '#1d4ed8',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.SESSIONS_COMPLETED,
  },
  {
    id: 'metric_listings_free',
    label: 'Наборы · free',
    description: 'Созданные бесплатные наборы (is_paid=false).',
    color: '#4ade80',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.LISTINGS_FREE,
  },
  {
    id: 'metric_listings_paid',
    label: 'Наборы · paid',
    description: 'Созданные платные наборы (is_paid=true).',
    color: '#fbbf24',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.LISTINGS_PAID,
  },
  {
    id: 'metric_open_seats',
    label: 'Open seats',
    description: 'Свободные места в RECRUITING-наборах.',
    color: '#b45309',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.OPEN_SEATS,
    gauge: true,
  },
  {
    id: 'metric_fill_rate',
    label: 'Fill rate',
    description: 'Средний fill_rate при старте/финише сессии (0…1).',
    color: '#ca8a04',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.AVG_FILL_RATE,
    gauge: true,
  },
  {
    id: 'metric_time_to_fill',
    label: 'Time to fill (ms)',
    description: 'Среднее время сбора стола до старта сессии.',
    color: '#a16207',
    group: 'metrics',
    defaultOn: false,
    dailyMetric: DAILY_METRICS.AVG_TIME_TO_FILL_MS,
    gauge: true,
  },
];

function utcTruncate(date: Date, bucket: ChartBucket): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  if (bucket === 'hour') {
    return new Date(Date.UTC(y, m, d, h));
  }
  if (bucket === 'day') {
    return new Date(Date.UTC(y, m, d));
  }
  if (bucket === 'week') {
    const day = new Date(Date.UTC(y, m, d));
    const weekday = day.getUTCDay(); // 0 Sun
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    day.setUTCDate(day.getUTCDate() + mondayOffset);
    return day;
  }
  return new Date(Date.UTC(y, m, 1));
}

function addBucket(date: Date, bucket: ChartBucket, amount = 1): Date {
  const next = new Date(date);
  if (bucket === 'hour') {
    next.setUTCHours(next.getUTCHours() + amount);
  } else if (bucket === 'day') {
    next.setUTCDate(next.getUTCDate() + amount);
  } else if (bucket === 'week') {
    next.setUTCDate(next.getUTCDate() + 7 * amount);
  } else {
    next.setUTCMonth(next.getUTCMonth() + amount);
  }
  return next;
}

function formatBucketKey(date: Date, bucket: ChartBucket): string {
  if (bucket === 'hour') {
    return date.toISOString().slice(0, 13) + ':00:00.000Z';
  }
  if (bucket === 'month') {
    return date.toISOString().slice(0, 7);
  }
  return date.toISOString().slice(0, 10);
}

function enumerateBuckets(
  from: Date,
  to: Date,
  bucket: ChartBucket,
): string[] {
  const keys: string[] = [];
  let cursor = utcTruncate(from, bucket);
  const end = utcTruncate(to, bucket);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(formatBucketKey(cursor, bucket));
    cursor = addBucket(cursor, bucket);
  }
  return keys;
}

async function queryEventBuckets(
  prisma: PrismaService,
  from: Date,
  bucket: ChartBucket,
): Promise<Map<string, Map<string, number>>> {
  const trunc = Prisma.raw(`date_trunc('${bucket}', "occurredAt")`);
  const names = [...TRACKED_EVENT_NAMES];
  const rows = await prisma.$queryRaw<
    Array<{ bucket: Date; name: string; count: number }>
  >`
    SELECT ${trunc} AS bucket,
           name,
           COUNT(*)::int AS count
    FROM analytics_events
    WHERE "occurredAt" >= ${from}
      AND name IN (${Prisma.join(names)})
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;

  const byName = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = formatBucketKey(new Date(row.bucket), bucket);
    let map = byName.get(row.name);
    if (!map) {
      map = new Map();
      byName.set(row.name, map);
    }
    map.set(key, Number(row.count) || 0);
  }
  return byName;
}

async function queryDailyMetricBuckets(
  prisma: PrismaService,
  from: Date,
  bucket: ChartBucket,
): Promise<Map<string, Map<string, number>>> {
  const metrics = SERIES_DEFS.map((s) => s.dailyMetric).filter(
    (m): m is string => Boolean(m),
  );
  if (metrics.length === 0) {
    return new Map();
  }

  if (bucket === 'hour') {
    return new Map();
  }

  const dayFrom = utcTruncate(from, 'day');
  const rows = await prisma.analyticsDailyMetric.findMany({
    where: {
      day: { gte: dayFrom },
      metric: { in: metrics },
    },
    select: { day: true, metric: true, value: true },
    orderBy: { day: 'asc' },
  });

  const byMetric = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = formatBucketKey(utcTruncate(new Date(row.day), bucket), bucket);
    let map = byMetric.get(row.metric);
    if (!map) {
      map = new Map();
      byMetric.set(row.metric, map);
    }
    // For gauges take last value in bucket; for summed metrics accumulate.
    const isGauge = SERIES_DEFS.some(
      (s) => s.dailyMetric === row.metric && s.gauge,
    );
    if (isGauge) {
      map.set(key, Number(row.value) || 0);
    } else {
      map.set(key, (map.get(key) ?? 0) + (Number(row.value) || 0));
    }
  }
  return byMetric;
}

async function querySnapshotBuckets(
  prisma: PrismaService,
  from: Date,
  bucket: ChartBucket,
): Promise<Map<string, Map<string, number>>> {
  const trunc = Prisma.raw(`date_trunc('${bucket}', "occurredAt")`);
  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      users_total: number | null;
      profiles_active: number | null;
      profiles_free_only: number | null;
      users_online: number | null;
    }>
  >`
    SELECT ${trunc} AS bucket,
           AVG((props->>'users_total')::float) AS users_total,
           AVG((props->>'profiles_active')::float) AS profiles_active,
           AVG((props->>'profiles_free_only')::float) AS profiles_free_only,
           AVG((props->>'users_online')::float) AS users_online
    FROM analytics_events
    WHERE "occurredAt" >= ${from}
      AND name = ${ANALYTICS_EVENTS.PLATFORM_SNAPSHOT}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const byProp = new Map<string, Map<string, number>>();
  const props = [
    'users_total',
    'profiles_active',
    'profiles_free_only',
    'users_online',
  ] as const;
  for (const prop of props) {
    byProp.set(prop, new Map());
  }
  for (const row of rows) {
    const key = formatBucketKey(new Date(row.bucket), bucket);
    for (const prop of props) {
      const raw = row[prop];
      if (raw == null) continue;
      byProp.get(prop)!.set(key, Math.round(Number(raw)));
    }
  }
  return byProp;
}

function pointsFromSparse(
  bucketKeys: string[],
  sparse: Map<string, number> | undefined,
  gauge: boolean,
): ChartPoint[] {
  let last = 0;
  let seen = false;
  return bucketKeys.map((t) => {
    if (sparse?.has(t)) {
      last = sparse.get(t) ?? 0;
      seen = true;
      return { t, v: last };
    }
    if (gauge && seen) {
      return { t, v: last };
    }
    return { t, v: 0 };
  });
}

function buildSeriesForRange(
  bucketKeys: string[],
  eventBuckets: Map<string, Map<string, number>>,
  metricBuckets: Map<string, Map<string, number>>,
  snapshotBuckets: Map<string, Map<string, number>>,
): ChartSeries[] {
  return SERIES_DEFS.map((def) => {
    if (def.eventNames) {
      const sparse = new Map<string, number>();
      for (const key of bucketKeys) {
        let v = 0;
        for (const name of def.eventNames) {
          v += eventBuckets.get(name)?.get(key) ?? 0;
        }
        if (v !== 0) sparse.set(key, v);
      }
      // Keep zeros for counters (no forward-fill).
      return {
        ...def,
        points: bucketKeys.map((t) => ({ t, v: sparse.get(t) ?? 0 })),
      };
    }

    if (def.snapshotProp || def.dailyMetric) {
      const fromSnapshot = def.snapshotProp
        ? snapshotBuckets.get(def.snapshotProp)
        : undefined;
      const fromDaily = def.dailyMetric
        ? metricBuckets.get(def.dailyMetric)
        : undefined;
      // Prefer snapshot (works for hour); fall back / merge with daily.
      const merged = new Map<string, number>();
      if (fromDaily) {
        for (const [k, v] of fromDaily) merged.set(k, v);
      }
      if (fromSnapshot) {
        for (const [k, v] of fromSnapshot) merged.set(k, v);
      }
      return {
        ...def,
        points: pointsFromSparse(bucketKeys, merged, Boolean(def.gauge)),
      };
    }

    return { ...def, points: bucketKeys.map((t) => ({ t, v: 0 })) };
  });
}

async function buildRange(
  prisma: PrismaService,
  key: ChartRange,
  label: string,
  bucket: ChartBucket,
  from: Date,
  to: Date,
): Promise<RangePayload> {
  const [eventBuckets, metricBuckets, snapshotBuckets] = await Promise.all([
    queryEventBuckets(prisma, from, bucket),
    queryDailyMetricBuckets(prisma, from, bucket),
    querySnapshotBuckets(prisma, from, bucket),
  ]);
  const bucketKeys = enumerateBuckets(from, to, bucket);
  return {
    key,
    label,
    bucket,
    from: from.toISOString(),
    to: to.toISOString(),
    series: buildSeriesForRange(
      bucketKeys,
      eventBuckets,
      metricBuckets,
      snapshotBuckets,
    ),
  };
}

async function countActiveProfilesNow(prisma: PrismaService): Promise<number> {
  const users = await prisma.user.findMany({
    where: { isPublic: true, isGuest: false },
    select: {
      roles: true,
      about: true,
      description: true,
      age: true,
      experiences: { select: { experienceTypeId: true } },
      availability: true,
      cityId: true,
      userCities: { select: { cityId: true } },
      playsOnline: true,
      timezone: true,
      systems: true,
      readyToLearnNew: true,
      openToAnySystem: true,
    },
    take: 5000,
  });
  return users.filter((user) =>
    isEligibleForWanderersFeed(buildQuestionnaireCompletionInput(user, false)),
  ).length;
}

async function buildAnalyticsDashboardData(prisma: PrismaService) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const earliest = await prisma.analyticsEvent.findFirst({
    orderBy: { occurredAt: 'asc' },
    select: { occurredAt: true },
  });
  const allFrom = earliest?.occurredAt
    ? utcTruncate(earliest.occurredAt, 'month')
    : utcTruncate(yearAgo, 'month');

  const [ranges, usersTotal, profilesActive, usersOnline] = await Promise.all([
    Promise.all([
      buildRange(prisma, 'day', 'День', 'hour', dayAgo, now),
      buildRange(prisma, 'week', 'Неделя', 'day', weekAgo, now),
      buildRange(prisma, 'month', 'Месяц', 'day', monthAgo, now),
      buildRange(prisma, 'year', 'Год', 'week', yearAgo, now),
      buildRange(prisma, 'all', 'Всё время', 'month', allFrom, now),
    ]),
    prisma.user.count({ where: { isGuest: false } }),
    countActiveProfilesNow(prisma),
    prisma.user.count({
      where: { isGuest: false, lastSeenAt: { gte: onlineSince } },
    }),
  ]);

  return {
    kpis: {
      usersTotal,
      profilesActive,
      usersOnline,
      onlineWindowMinutes: Math.round(ONLINE_WINDOW_MS / 60_000),
    },
    ranges: Object.fromEntries(ranges.map((r) => [r.key, r])) as Record<
      ChartRange,
      RangePayload
    >,
    seriesMeta: SERIES_DEFS.map(
      ({ id, label, description, color, group, defaultOn }) => ({
        id,
        label,
        description,
        color,
        group,
        defaultOn,
      }),
    ),
  };
}

const readOnlyActions = {
  new: { isAccessible: false },
  edit: { isAccessible: false },
  delete: { isAccessible: false },
  bulkDelete: { isAccessible: false },
} as const;

export async function setupAdmin(
  app: INestApplication,
  configService: ConfigService,
  prisma: PrismaService,
) {
  const [adminjsModule, { default: AdminJSExpress }, prismaAdapter] =
    await Promise.all([
      loadEsmModule<{
        default: typeof import('adminjs').default;
        ComponentLoader: new (...args: never[]) => {
          add: (name: string, path: string) => string;
        };
      }>('adminjs'),
      loadEsmModule<{ default: typeof import('@adminjs/express').default }>(
        '@adminjs/express',
      ),
      loadEsmModule<typeof import('@adminjs/prisma')>('@adminjs/prisma'),
    ]);
  const AdminJS = adminjsModule.default;
  // AdminJS ESM typings for ComponentLoader are incomplete under Nest's TS config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ComponentLoader = adminjsModule.ComponentLoader as any;
  const { Database, Resource, getModelByName } = prismaAdapter;

  AdminJS.registerAdapter({ Database, Resource });

  const componentLoader = new ComponentLoader();

  const resolveAdminComponent = (name: string) => {
    const candidates = [
      // Next to compiled setup-admin.js (dist/src/admin) — preferred in Docker.
      join(__dirname, name),
      join(process.cwd(), 'dist/src/admin', name),
      join(process.cwd(), 'dist/admin', name),
      join(process.cwd(), 'src/admin', name),
    ];
    const found = candidates.find(
      (candidate) =>
        existsSync(`${candidate}.jsx`) ||
        existsSync(`${candidate}.tsx`) ||
        existsSync(`${candidate}.js`) ||
        existsSync(candidate),
    );
    if (!found) {
      throw new Error(
        `AdminJS component "${name}" not found. Tried:\n${candidates.join('\n')}`,
      );
    }
    return found;
  };

  const dashboardComponent = componentLoader.add(
    'AnalyticsDashboard',
    resolveAdminComponent('analytics-dashboard'),
  );
  const metrikaComponent = componentLoader.add(
    'MetrikaSettings',
    resolveAdminComponent('metrika-settings'),
  );

  const analyticsNavigation = { name: 'Аналитика', icon: 'Activity' };
  const appSettings = new AppSettingsService(prisma);

  const admin = new AdminJS({
    rootPath: '/admin',
    componentLoader,
    branding: {
      companyName: 'Adventura Admin',
      withMadeWithLove: false,
    },
    locale: {
      language: 'ru',
      availableLanguages: ['ru', 'en'],
      translations: {
        ru: {
          labels: {
            AnalyticsEvent: 'События',
            AnalyticsDailyMetric: 'Суточные метрики',
          },
          pages: {
            metrikaSettings: 'Яндекс Метрика',
          },
          resources: {
            AnalyticsEvent: {
              properties: {
                name: 'Событие',
                userId: 'Пользователь',
                platform: 'Платформа',
                appVersion: 'Версия',
                occurredAt: 'Когда',
                props: 'Свойства',
                createdAt: 'Записано',
              },
            },
            AnalyticsDailyMetric: {
              properties: {
                day: 'День',
                metric: 'Метрика',
                value: 'Значение',
                updatedAt: 'Обновлено',
              },
            },
          },
        },
      },
    },
    dashboard: {
      component: dashboardComponent,
      handler: async () => buildAnalyticsDashboardData(prisma),
    },
    pages: {
      metrikaSettings: {
        icon: 'Settings',
        component: metrikaComponent,
        handler: async (request: {
          method?: string;
          payload?: Record<string, unknown>;
        }) => {
          const method = (request.method ?? 'get').toLowerCase();
          if (method === 'post') {
            try {
              const payload = request.payload ?? {};
              const asBool = (value: unknown, fallback: boolean) => {
                if (value === undefined || value === null || value === '') {
                  return fallback;
                }
                if (typeof value === 'boolean') {
                  return value;
                }
                const raw = String(value).toLowerCase();
                return raw === 'true' || raw === '1' || raw === 'on';
              };
              const current = await appSettings.getYandexMetrikaAdmin();
              const saved = await appSettings.saveYandexMetrika({
                counterId: String(payload.counterId ?? ''),
                webvisor: asBool(payload.webvisor, current.webvisor),
                clickmap: asBool(payload.clickmap, current.clickmap),
                trackLinks: asBool(payload.trackLinks, current.trackLinks),
                accurateTrackBounce: asBool(
                  payload.accurateTrackBounce,
                  current.accurateTrackBounce,
                ),
              });
              return {
                ...saved,
                notice: {
                  message: saved.counterId
                    ? `Счётчик ${saved.counterId} сохранён`
                    : 'Метрика выключена (пустой ID)',
                  type: 'success',
                },
              };
            } catch (error) {
              const current = await appSettings.getYandexMetrikaAdmin();
              return {
                ...current,
                notice: {
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Не удалось сохранить',
                  type: 'error',
                },
              };
            }
          }
          return appSettings.getYandexMetrikaAdmin();
        },
      },
    },
    resources: [
      {
        resource: { model: getModelByName('AnalyticsEvent'), client: prisma },
        options: {
          navigation: analyticsNavigation,
          sort: { sortBy: 'occurredAt', direction: 'desc' },
          listProperties: [
            'occurredAt',
            'name',
            'userId',
            'platform',
            'appVersion',
            'props',
          ],
          filterProperties: ['name', 'userId', 'platform', 'occurredAt'],
          showProperties: [
            'id',
            'name',
            'userId',
            'platform',
            'appVersion',
            'occurredAt',
            'props',
            'createdAt',
          ],
          actions: { ...readOnlyActions },
          properties: {
            props: {
              type: 'mixed',
              isVisible: {
                list: true,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
        },
      },
      {
        resource: {
          model: getModelByName('AnalyticsDailyMetric'),
          client: prisma,
        },
        options: {
          navigation: analyticsNavigation,
          sort: { sortBy: 'day', direction: 'desc' },
          listProperties: ['day', 'metric', 'value', 'updatedAt'],
          filterProperties: ['day', 'metric'],
          showProperties: ['id', 'day', 'metric', 'value', 'updatedAt'],
          actions: { ...readOnlyActions },
        },
      },
      {
        resource: { model: getModelByName('User'), client: prisma },
        options: {
          navigation: { name: 'Пользователи', icon: 'User' },
          listProperties: ['id', 'email', 'nickname', 'isGuest', 'location', 'createdAt'],
          properties: {
            passwordHash: {
              isVisible: {
                list: false,
                show: false,
                edit: false,
                filter: false,
              },
            },
            refreshTokens: {
              isVisible: {
                list: false,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
        },
      },
      {
        resource: { model: getModelByName('RefreshToken'), client: prisma },
        options: {
          navigation: { name: 'Сессии', icon: 'Key' },
          listProperties: ['id', 'userId', 'expiresAt', 'createdAt'],
          properties: {
            tokenHash: {
              isVisible: {
                list: false,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
        },
      },
      {
        resource: { model: getModelByName('Status'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('ExperienceType'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('GameSystem'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'description', 'sortOrder', 'isOfficial'],
          properties: {
            description: {
              isRequired: false,
            },
          },
        },
      },
      {
        resource: { model: getModelByName('Country'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'code', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('City'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'countryId', 'region', 'population', 'isActive'],
        },
      },
      {
        resource: { model: getModelByName('UserStatus'), client: prisma },
        options: {
          navigation: { name: 'Связи', icon: 'Link' },
          listProperties: ['userId', 'statusId', 'createdAt'],
        },
      },
      {
        resource: { model: getModelByName('UserExperience'), client: prisma },
        options: {
          navigation: { name: 'Связи', icon: 'Link' },
          listProperties: ['userId', 'experienceTypeId', 'createdAt'],
        },
      },
      {
        resource: { model: getModelByName('Media'), client: prisma },
        options: {
          navigation: { name: 'Медиа', icon: 'Image' },
          listProperties: [
            'id',
            'entityType',
            'entityId',
            'collection',
            'variant',
            'mimeType',
            'size',
          ],
        },
      },
    ],
  });

  // @adminjs/express calls initialize() without await — race leaves UserComponents
  // empty → custom pages show componentNotFound while dashboard silently falls back.
  if (process.env.NODE_ENV === 'production') {
    await admin.initialize();
    const adminJsDir =
      process.env.ADMIN_JS_TMP_DIR?.trim() || join(process.cwd(), '.adminjs');
    const bundlePath = join(adminJsDir, 'bundle.js');
    const entryPath = join(adminJsDir, 'entry.js');
    if (!existsSync(bundlePath) || !existsSync(entryPath)) {
      throw new Error(
        `AdminJS bundle missing after initialize (${entryPath}, ${bundlePath})`,
      );
    }
    const entry = readFileSync(entryPath, 'utf8');
    for (const id of ['AnalyticsDashboard', 'MetrikaSettings'] as const) {
      if (!entry.includes(id)) {
        throw new Error(`AdminJS entry.js missing component ${id}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `AdminJS: custom components ready (${bundlePath}, ${Buffer.byteLength(readFileSync(bundlePath))} bytes)`,
    );
  } else {
    await admin.watch();
  }

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email: string, password: string) => {
        const adminEmail = configService.get<string>('ADMIN_EMAIL');
        const adminPassword = configService.get<string>('ADMIN_PASSWORD');

        if (
          email === adminEmail &&
          password === adminPassword &&
          adminEmail &&
          adminPassword
        ) {
          return { email };
        }

        return null;
      },
      cookieName: 'adventura_admin',
      cookiePassword: configService.getOrThrow<string>('ADMIN_COOKIE_SECRET'),
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: configService.getOrThrow<string>('ADMIN_SESSION_SECRET'),
    },
  );

  const expressApp = app.getHttpAdapter().getInstance();
  // Browsers / proxies eagerly cache components.bundle.js — stale empty bundle
  // shows componentNotFound for new AdminJS pages while the sidebar still lists them.
  expressApp.use(
    `${admin.options.rootPath}/frontend/assets/components.bundle.js`,
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      next();
    },
  );
  expressApp.use(admin.options.rootPath, router);
}
