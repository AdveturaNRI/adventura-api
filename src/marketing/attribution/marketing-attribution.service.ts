import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MarketingCampaignStatus,
  MarketingLandingStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { RecordMarketingTouchDto } from './dto/record-marketing-touch.dto';

const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_TOUCHES_PER_MINUTE = 20;
const BINDABLE_TOUCH_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type ResolvedVariant = {
  id: string;
  campaignId: string;
  landingId: string;
  campaign: { status: MarketingCampaignStatus };
  landing: { slug: string };
};

@Injectable()
export class MarketingAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists one acquisition touch. A campaign can only be selected through
   * its configured variant, never through a client-provided campaignId.
   */
  async recordTouch(dto: RecordMarketingTouchDto) {
    const now = new Date();
    const variant = await this.resolveVariant(dto);
    const landingId =
      variant?.landingId ??
      (dto.landingSlug ? await this.resolveLandingIdBySlug(dto.landingSlug) : null);
    const variantId = variant?.id ?? null;

    const duplicate = await this.prisma.marketingAttributionTouch.findFirst({
      where: {
        anonymousId: dto.anonymousId,
        variantId,
        landingId,
        yclid: this.text(dto.yclid),
        occurredAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { occurredAt: 'desc' },
      select: { id: true },
    });
    if (duplicate) return { recorded: false, reason: 'duplicate', touchId: duplicate.id };

    const recentCount = await this.prisma.marketingAttributionTouch.count({
      where: {
        anonymousId: dto.anonymousId,
        occurredAt: { gte: new Date(now.getTime() - 60_000) },
      },
    });
    if (recentCount >= MAX_TOUCHES_PER_MINUTE) {
      return { recorded: false, reason: 'rate_limited' };
    }

    const touch = await this.prisma.marketingAttributionTouch.create({
      data: {
        anonymousId: dto.anonymousId,
        campaignId: variant?.campaignId ?? null,
        variantId,
        landingId,
        ...this.utmData(dto),
        yclid: this.text(dto.yclid),
        referrer: this.normalizeReferrer(dto.referrer),
        occurredAt: now,
      },
      select: { id: true, occurredAt: true },
    });

    return { recorded: true, touchId: touch.id, occurredAt: touch.occurredAt };
  }

  /** First and last touches are calculated from immutable ordered history. */
  async getUserAttribution(userId: string) {
    const [firstTouch, lastTouch] = await Promise.all([
      this.prisma.marketingAttributionTouch.findFirst({
        where: { userId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.marketingAttributionTouch.findFirst({
        where: { userId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { firstTouch, lastTouch };
  }

  /**
   * Associates only unclaimed, recent anonymous touches with the authenticated
   * / newly registered user. Existing attribution is never reassigned.
   */
  async bindAnonymousTouches(userId: string, anonymousId: string) {
    const result = await this.prisma.marketingAttributionTouch.updateMany({
      where: {
        anonymousId,
        userId: null,
        occurredAt: { gte: new Date(Date.now() - BINDABLE_TOUCH_AGE_MS) },
      },
      data: { userId },
    });
    return { bound: result.count };
  }

  private async resolveVariant(
    dto: RecordMarketingTouchDto,
  ): Promise<ResolvedVariant | null> {
    if (!dto.variantId) return null;
    const variant = await this.prisma.marketingCampaignVariant.findFirst({
      where: { id: dto.variantId, isActive: true },
      select: {
        id: true,
        campaignId: true,
        landingId: true,
        campaign: { select: { status: true } },
        landing: { select: { slug: true } },
      },
    });
    if (!variant || variant.campaign.status === MarketingCampaignStatus.ARCHIVED) {
      throw new BadRequestException('Вариант рекламной кампании недоступен');
    }
    if (dto.landingSlug && dto.landingSlug.toLowerCase() !== variant.landing.slug.toLowerCase()) {
      throw new BadRequestException('Вариант кампании не соответствует лендингу');
    }
    return variant;
  }

  private async resolveLandingIdBySlug(slugRaw: string): Promise<string | null> {
    const slug = slugRaw.trim().toLowerCase();
    if (!slug) return null;
    const landing = await this.prisma.marketingLanding.findFirst({
      where: {
        slug,
        status: MarketingLandingStatus.PUBLISHED,
        publishedVersionId: { not: null },
      },
      select: { id: true },
    });
    return landing?.id ?? null;
  }

  private utmData(
    dto: RecordMarketingTouchDto,
  ): Pick<
    Prisma.MarketingAttributionTouchUncheckedCreateInput,
    | 'utmSource'
    | 'utmMedium'
    | 'utmCampaign'
    | 'utmContent'
    | 'utmTerm'
    | 'utmId'
  > {
    return {
      utmSource: this.text(dto.utmSource),
      utmMedium: this.text(dto.utmMedium),
      utmCampaign: this.text(dto.utmCampaign),
      utmContent: this.text(dto.utmContent),
      utmTerm: this.text(dto.utmTerm),
      utmId: this.text(dto.utmId),
    };
  }

  private normalizeReferrer(value?: string): string | null {
    const raw = this.text(value);
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
      return url.origin;
    } catch {
      throw new BadRequestException('Некорректный referrer');
    }
  }

  private text(value?: string): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }
}
