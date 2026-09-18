import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsPlatform } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { AnalyticsAggregatorService } from './analytics-aggregator.service';
import { AnalyticsService } from './analytics.service';
import { IngestAnalyticsEventsDto } from './dto/ingest-events.dto';
import { ListDailyMetricsQueryDto } from './dto/list-daily-metrics.dto';
import { TrackEntityStatsDto } from './dto/track-entity-stats.dto';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly aggregator: AnalyticsAggregatorService,
  ) {}

  @Post('events')
  ingest(@CurrentUser() user: AuthUser, @Body() dto: IngestAnalyticsEventsDto) {
    return this.analytics.ingestBatch(user.id, dto.events ?? [], {
      platform: dto.platform,
      appVersion: dto.appVersion,
    });
  }

  /**
   * Impression after ≥3s visibility on client.
   * Rate-limited: 1 recorded view per user+entity+id per hour.
   */
  @Post('views')
  @HttpCode(200)
  async trackView(
    @CurrentUser() user: AuthUser,
    @Body() dto: TrackEntityStatsDto,
  ) {
    const result = await this.analytics.recordEntityView(
      user.id,
      dto.entity,
      dto.id,
      {
        platform: (dto.platform as AnalyticsPlatform | undefined) ?? undefined,
        appVersion: dto.appVersion,
      },
    );

    if (!result.recorded) {
      throw new HttpException(
        { recorded: false, reason: result.reason },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { recorded: true };
  }

  /**
   * Navigation / open of a detail page.
   * Rate-limited: 1 recorded transition per user+entity+id per hour.
   */
  @Post('transitions')
  @HttpCode(200)
  async trackTransition(
    @CurrentUser() user: AuthUser,
    @Body() dto: TrackEntityStatsDto,
  ) {
    const result = await this.analytics.recordEntityTransition(
      user.id,
      dto.entity,
      dto.id,
      {
        platform: (dto.platform as AnalyticsPlatform | undefined) ?? undefined,
        appVersion: dto.appVersion,
      },
    );

    if (!result.recorded) {
      throw new HttpException(
        { recorded: false, reason: result.reason },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { recorded: true };
  }

  @Get('metrics/daily')
  async dailyMetrics(@Query() query: ListDailyMetricsQueryDto) {
    const rows = await this.aggregator.listDailyMetrics(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );

    return {
      metrics: rows.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        metric: row.metric,
        value: row.value,
      })),
    };
  }

  @Post('metrics/aggregate')
  async aggregateNow() {
    const today = new Date();
    const day = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    await this.aggregator.aggregateDay(day);
    return { ok: true, day: day.toISOString().slice(0, 10) };
  }
}
