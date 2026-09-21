import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsPlatform, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  ENTITY_STATS_RATE_LIMIT_MS,
  TRANSITION_EVENT_BY_ENTITY,
  VIEW_EVENT_BY_ENTITY,
  sanitizeAnalyticsProps,
  type AnalyticsEntityKind,
  type AnalyticsEventName,
} from './analytics.constants';

export type TrackAnalyticsInput = {
  name: AnalyticsEventName | string;
  userId?: string | null;
  platform?: AnalyticsPlatform;
  appVersion?: string | null;
  occurredAt?: Date;
  props?: Record<string, unknown>;
};

export type EntityStatsResult =
  | { recorded: true }
  | { recorded: false; reason: 'rate_limited' };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget; never throws to callers. */
  track(input: TrackAnalyticsInput): void {
    void this.persist(input).catch((error: unknown) => {
      this.logger.warn(
        `Failed to persist analytics event ${input.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async persist(input: TrackAnalyticsInput): Promise<void> {
    const props = sanitizeAnalyticsProps(input.props);
    await this.prisma.analyticsEvent.create({
      data: {
        name: input.name.slice(0, 80),
        userId: input.userId || null,
        platform: input.platform ?? AnalyticsPlatform.SERVER,
        appVersion: input.appVersion?.slice(0, 32) || null,
        occurredAt: input.occurredAt ?? new Date(),
        props: props as Prisma.InputJsonValue,
      },
    });

    // Keep presence fresh for online KPI (lastSeenAt window).
    if (input.userId) {
      await this.prisma.user
        .update({
          where: { id: input.userId },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => undefined);
    }
  }

  async recordEntityView(
    userId: string,
    entity: AnalyticsEntityKind,
    entityId: string,
    defaults: {
      platform?: AnalyticsPlatform;
      appVersion?: string | null;
    } = {},
  ): Promise<EntityStatsResult> {
    return this.recordEntityStat(
      userId,
      VIEW_EVENT_BY_ENTITY[entity],
      entity,
      entityId,
      'view',
      defaults,
    );
  }

  async recordEntityTransition(
    userId: string,
    entity: AnalyticsEntityKind,
    entityId: string,
    defaults: {
      platform?: AnalyticsPlatform;
      appVersion?: string | null;
    } = {},
  ): Promise<EntityStatsResult> {
    return this.recordEntityStat(
      userId,
      TRANSITION_EVENT_BY_ENTITY[entity],
      entity,
      entityId,
      'transition',
      defaults,
    );
  }

  private async recordEntityStat(
    userId: string,
    name: AnalyticsEventName,
    entity: AnalyticsEntityKind,
    entityId: string,
    kind: 'view' | 'transition',
    defaults: {
      platform?: AnalyticsPlatform;
      appVersion?: string | null;
    },
  ): Promise<EntityStatsResult> {
    const id = entityId.trim().slice(0, 64);
    if (!id) {
      return { recorded: false, reason: 'rate_limited' };
    }

    const since = new Date(Date.now() - ENTITY_STATS_RATE_LIMIT_MS);
    const recent = await this.prisma.analyticsEvent.findFirst({
      where: {
        userId,
        name,
        occurredAt: { gte: since },
        AND: [
          { props: { path: ['entity_id'], equals: id } },
          { props: { path: ['entity'], equals: entity } },
        ],
      },
      select: { id: true },
    });

    if (recent) {
      return { recorded: false, reason: 'rate_limited' };
    }

    await this.persist({
      name,
      userId,
      platform: defaults.platform ?? AnalyticsPlatform.WEB,
      appVersion: defaults.appVersion,
      props: {
        entity,
        entity_id: id,
        kind,
      },
    });

    return { recorded: true };
  }

  async ingestBatch(
    userId: string,
    events: Array<{
      name: string;
      occurredAt?: string;
      props?: Record<string, unknown>;
      platform?: AnalyticsPlatform;
      appVersion?: string;
    }>,
    defaults: {
      platform?: AnalyticsPlatform;
      appVersion?: string;
    } = {},
  ): Promise<{ accepted: number }> {
    const sliced = events.slice(0, 50);
    if (sliced.length === 0) {
      return { accepted: 0 };
    }

    const rows = sliced.map((event) => {
      const occurredAt = event.occurredAt
        ? new Date(event.occurredAt)
        : new Date();
      return {
        name: event.name.slice(0, 80),
        userId,
        platform:
          event.platform ?? defaults.platform ?? AnalyticsPlatform.WEB,
        appVersion:
          (event.appVersion ?? defaults.appVersion)?.slice(0, 32) || null,
        occurredAt: Number.isNaN(occurredAt.getTime())
          ? new Date()
          : occurredAt,
        props: sanitizeAnalyticsProps(event.props) as Prisma.InputJsonValue,
      };
    });

    const result = await this.prisma.analyticsEvent.createMany({ data: rows });
    return { accepted: result.count };
  }
}
