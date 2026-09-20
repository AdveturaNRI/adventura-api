import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnalyticsPlatform, GameStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  computeLiquidity,
  computeStickinessPercent,
} from './analytics-aggregation.util';
import {
  ANALYTICS_EVENTS,
  DAILY_METRICS,
  ONLINE_WINDOW_MS,
} from './analytics.constants';
import {
  buildQuestionnaireCompletionInput,
  isEligibleForWanderersFeed,
} from '../users/utils/questionnaire-completion.util';

function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(day: Date, days: number): Date {
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

@Injectable()
export class AnalyticsAggregatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsAggregatorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.safeAggregateRecent();
    }, 60 * 60 * 1000);
    void this.safeAggregateRecent();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safeAggregateRecent() {
    try {
      const today = utcDayStart(new Date());
      await this.aggregateDay(today);
      await this.aggregateDay(addUtcDays(today, -1));
      // Retention looks back up to 30 days — refresh a few cohort days.
      for (const offset of [1, 7, 30]) {
        await this.aggregateRetentionOnly(addUtcDays(today, -offset));
      }
      await this.writePlatformSnapshot(today);
    } catch (error: unknown) {
      this.logger.warn(
        `Daily analytics aggregation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async countUsersOnline(now = new Date()): Promise<number> {
    const since = new Date(now.getTime() - ONLINE_WINDOW_MS);
    return this.prisma.user.count({
      where: {
        isGuest: false,
        lastSeenAt: { gte: since },
      },
    });
  }

  /** Live gauges + hourly snapshot event for chart day-range. */
  async writePlatformSnapshot(day = utcDayStart(new Date())) {
    const [usersTotal, profilesActive, profilesFreeOnly, usersOnline] =
      await Promise.all([
        this.prisma.user.count({ where: { isGuest: false } }),
        this.countActiveProfiles(),
        this.countFreeOnlyProfiles(),
        this.countUsersOnline(),
      ]);

    await Promise.all([
      this.upsertMetric(day, DAILY_METRICS.USERS_TOTAL, usersTotal),
      this.upsertMetric(day, DAILY_METRICS.USERS_ONLINE, usersOnline),
      this.upsertMetric(day, DAILY_METRICS.PROFILES_ACTIVE, profilesActive),
      this.upsertMetric(day, DAILY_METRICS.PROFILES_FREE_ONLY, profilesFreeOnly),
    ]);

    await this.prisma.analyticsEvent.create({
      data: {
        name: ANALYTICS_EVENTS.PLATFORM_SNAPSHOT,
        platform: AnalyticsPlatform.SERVER,
        props: {
          users_total: usersTotal,
          profiles_active: profilesActive,
          profiles_free_only: profilesFreeOnly,
          users_online: usersOnline,
        },
      },
    });

    return { usersTotal, profilesActive, profilesFreeOnly, usersOnline };
  }

  /**
   * Recompute daily metrics for each UTC day in [from, to] inclusive.
   * Does not delete raw analytics_events — only upserts AnalyticsDailyMetric rows.
   */
  async aggregateRange(from: Date, to: Date): Promise<{ days: number }> {
    let cursor = utcDayStart(from);
    const end = utcDayStart(to);
    let days = 0;
    while (cursor.getTime() <= end.getTime()) {
      await this.aggregateDay(cursor);
      days += 1;
      cursor = addUtcDays(cursor, 1);
    }
    return { days };
  }

  async aggregateDay(day: Date): Promise<void> {
    const from = utcDayStart(day);
    const to = addUtcDays(from, 1);
    const weekFrom = addUtcDays(from, -6);
    const monthFrom = addUtcDays(from, -29);

    const [
      sessionsCreated,
      sessionsCompleted,
      listingsFree,
      listingsPaid,
      dau,
      wau,
      mau,
      fillSamples,
      timeToFillSamples,
      openGames,
      usersTotal,
      activeProfiles,
      profilesFreeOnly,
      contacts,
      matches,
      applicationsSent,
      applicationsApproved,
      matchTimingRows,
    ] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.GAME_LISTING_CREATED,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.GAME_SESSION_COMPLETED,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.countPropTrue(
        ANALYTICS_EVENTS.GAME_LISTING_CREATED,
        from,
        to,
        'is_paid',
        false,
      ),
      this.countPropTrue(
        ANALYTICS_EVENTS.GAME_LISTING_CREATED,
        from,
        to,
        'is_paid',
        true,
      ),
      this.countDistinctSessionUsers(from, to),
      this.countDistinctSessionUsers(weekFrom, to),
      this.countDistinctSessionUsers(monthFrom, to),
      this.prisma.analyticsEvent.findMany({
        where: {
          name: {
            in: [
              ANALYTICS_EVENTS.GAME_SESSION_STARTED,
              ANALYTICS_EVENTS.GAME_SESSION_COMPLETED,
            ],
          },
          occurredAt: { gte: from, lt: to },
        },
        select: { props: true },
      }),
      this.prisma.analyticsEvent.findMany({
        where: {
          name: ANALYTICS_EVENTS.GAME_SESSION_STARTED,
          occurredAt: { gte: from, lt: to },
        },
        select: { props: true },
      }),
      this.prisma.game.findMany({
        where: { status: GameStatus.RECRUITING },
        select: { maxPlayers: true, _count: { select: { players: true } } },
      }),
      this.prisma.user.count({ where: { isGuest: false } }),
      this.countActiveProfiles(),
      this.countFreeOnlyProfiles(),
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.PLAYER_PROFILE_CONTACTED,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.PLAYER_MATCH_COMPLETED,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.GAME_APPLICATION_SENT,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          name: ANALYTICS_EVENTS.GAME_APPLICATION_APPROVED,
          occurredAt: { gte: from, lt: to },
        },
      }),
      this.prisma.analyticsEvent.findMany({
        where: {
          name: ANALYTICS_EVENTS.PLAYER_MATCH_COMPLETED,
          occurredAt: { gte: from, lt: to },
        },
        select: { props: true },
      }),
    ]);

    const openSeats = openGames.reduce(
      (sum, game) => sum + Math.max(0, game.maxPlayers - game._count.players),
      0,
    );

    const liquidity = computeLiquidity(activeProfiles, openSeats);
    const stickiness = computeStickinessPercent(dau, mau);
    const matchRate =
      contacts > 0 ? Number((matches / contacts).toFixed(4)) : matches > 0 ? 1 : 0;
    const applyApproveRate =
      applicationsSent > 0
        ? Number((applicationsApproved / applicationsSent).toFixed(4))
        : 0;

    const fillRates = fillSamples
      .map((row) => numberProp(row.props, 'fill_rate'))
      .filter((value): value is number => value != null);
    const avgFillRate =
      fillRates.length > 0
        ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length
        : 0;

    const timeToFill = timeToFillSamples
      .map((row) => numberProp(row.props, 'time_to_fill_ms'))
      .filter((value): value is number => value != null);
    const avgTimeToFill =
      timeToFill.length > 0
        ? timeToFill.reduce((a, b) => a + b, 0) / timeToFill.length
        : 0;

    const timeToMatch = matchTimingRows
      .map((row) => numberProp(row.props, 'time_to_match_ms'))
      .filter((value): value is number => value != null);
    const avgTimeToMatch =
      timeToMatch.length > 0
        ? timeToMatch.reduce((a, b) => a + b, 0) / timeToMatch.length
        : 0;

    const [retentionD1, retentionD7, retentionD30] = await Promise.all([
      this.computeRetention(from, 1),
      this.computeRetention(from, 7),
      this.computeRetention(from, 30),
    ]);

    await Promise.all([
      this.upsertMetric(from, DAILY_METRICS.SESSIONS_CREATED, sessionsCreated),
      this.upsertMetric(from, DAILY_METRICS.SESSIONS_COMPLETED, sessionsCompleted),
      this.upsertMetric(from, DAILY_METRICS.LISTINGS_FREE, listingsFree),
      this.upsertMetric(from, DAILY_METRICS.LISTINGS_PAID, listingsPaid),
      this.upsertMetric(from, DAILY_METRICS.DAU, dau),
      this.upsertMetric(from, DAILY_METRICS.WAU, wau),
      this.upsertMetric(from, DAILY_METRICS.MAU, mau),
      this.upsertMetric(from, DAILY_METRICS.STICKINESS, stickiness),
      this.upsertMetric(from, DAILY_METRICS.USERS_TOTAL, usersTotal),
      this.upsertMetric(from, DAILY_METRICS.PROFILES_ACTIVE, activeProfiles),
      this.upsertMetric(from, DAILY_METRICS.PROFILES_FREE_ONLY, profilesFreeOnly),
      this.upsertMetric(from, DAILY_METRICS.OPEN_SEATS, openSeats),
      this.upsertMetric(from, DAILY_METRICS.LIQUIDITY, liquidity),
      this.upsertMetric(from, DAILY_METRICS.AVG_FILL_RATE, avgFillRate),
      this.upsertMetric(from, DAILY_METRICS.AVG_TIME_TO_FILL_MS, avgTimeToFill),
      this.upsertMetric(from, DAILY_METRICS.MATCH_RATE, matchRate),
      this.upsertMetric(from, DAILY_METRICS.AVG_TIME_TO_MATCH_MS, avgTimeToMatch),
      this.upsertMetric(from, DAILY_METRICS.APPLY_APPROVE_RATE, applyApproveRate),
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D1, retentionD1),
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D7, retentionD7),
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D30, retentionD30),
    ]);
  }

  private async aggregateRetentionOnly(day: Date) {
    const from = utcDayStart(day);
    const [retentionD1, retentionD7, retentionD30] = await Promise.all([
      this.computeRetention(from, 1),
      this.computeRetention(from, 7),
      this.computeRetention(from, 30),
    ]);
    await Promise.all([
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D1, retentionD1),
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D7, retentionD7),
      this.upsertMetric(from, DAILY_METRICS.RETENTION_D30, retentionD30),
    ]);
  }

  /**
   * Among users registered on (day - n), share who had a session on `day`.
   * Stored on the activity day so the chart shows “who came back today”.
   * Returns null when the cohort is empty / immature — do not treat as 0%.
   */
  private async computeRetention(
    activityDay: Date,
    n: number,
  ): Promise<number | null> {
    const cohortDay = addUtcDays(activityDay, -n);
    const cohortEnd = addUtcDays(cohortDay, 1);
    const activityEnd = addUtcDays(activityDay, 1);

    const registered = await this.prisma.analyticsEvent.findMany({
      where: {
        name: ANALYTICS_EVENTS.USER_REGISTERED,
        occurredAt: { gte: cohortDay, lt: cohortEnd },
        userId: { not: null },
      },
      select: { userId: true, props: true },
    });

    const cohortIds = [
      ...new Set(
        registered
          .filter((row) => asProps(row.props).is_guest !== true)
          .map((row) => row.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (cohortIds.length === 0) {
      return null;
    }

    const returned = await this.prisma.analyticsEvent.findMany({
      where: {
        name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
        occurredAt: { gte: activityDay, lt: activityEnd },
        userId: { in: cohortIds },
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    return Number((returned.length / cohortIds.length).toFixed(4));
  }

  private async countDistinctSessionUsers(from: Date, to: Date): Promise<number> {
    const rows = await this.prisma.analyticsEvent.findMany({
      where: {
        name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
        occurredAt: { gte: from, lt: to },
        userId: { not: null },
      },
      distinct: ['userId'],
      select: { userId: true },
    });
    return rows.length;
  }

  private async upsertMetric(
    day: Date,
    metric: string,
    value: number | null,
  ) {
    if (value == null || !Number.isFinite(value)) {
      // Drop stale gauge (e.g. old stickiness) when cohort/denominator is empty.
      await this.prisma.analyticsDailyMetric.deleteMany({
        where: { day, metric },
      });
      return;
    }
    await this.prisma.analyticsDailyMetric.upsert({
      where: { day_metric: { day, metric } },
      create: { day, metric, value },
      update: { value },
    });
  }

  private async countPropTrue(
    name: string,
    from: Date,
    to: Date,
    key: string,
    expected: boolean,
  ): Promise<number> {
    const rows = await this.prisma.analyticsEvent.findMany({
      where: { name, occurredAt: { gte: from, lt: to } },
      select: { props: true },
    });

    return rows.filter((row) => {
      const props = asProps(row.props);
      return props[key] === expected;
    }).length;
  }

  private profileSelect() {
    return {
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
      prefersFreeOnly: true,
    } as const;
  }

  private async countActiveProfiles(): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { isPublic: true, isGuest: false },
      select: this.profileSelect(),
      take: 5000,
    });

    return users.filter((user) =>
      isEligibleForWanderersFeed(
        buildQuestionnaireCompletionInput(user, false),
      ),
    ).length;
  }

  private async countFreeOnlyProfiles(): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { isPublic: true, isGuest: false, prefersFreeOnly: true },
      select: this.profileSelect(),
      take: 5000,
    });

    return users.filter((user) =>
      isEligibleForWanderersFeed(
        buildQuestionnaireCompletionInput(user, false),
      ),
    ).length;
  }

  async listDailyMetrics(from?: Date, to?: Date) {
    const end = to ? utcDayStart(to) : utcDayStart(new Date());
    const start = from ? utcDayStart(from) : addUtcDays(end, -30);

    return this.prisma.analyticsDailyMetric.findMany({
      where: { day: { gte: start, lte: end } },
      orderBy: [{ day: 'asc' }, { metric: 'asc' }],
    });
  }
}

function asProps(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function numberProp(value: Prisma.JsonValue, key: string): number | null {
  const props = asProps(value);
  const raw = props[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}
