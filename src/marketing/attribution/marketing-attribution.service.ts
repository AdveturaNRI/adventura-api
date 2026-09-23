import { Injectable } from '@nestjs/common';
import {
  MarketingCampaignStatus,
  MarketingLandingStatus,
  Prisma,
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
  landing: { slug: string; status: MarketingLandingStatus };
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  utmId: string | null;
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
      (dto.landingSlug
        ? await this.resolveLandingIdBySlug(dto.landingSlug)
        : null);
    const variantId = variant?.id ?? null;
    const idempotencyKey = this.text(dto.idempotencyKey);

    if (idempotencyKey) {
      const existing = await this.prisma.marketingAttributionTouch.findUnique({
        where: { idempotencyKey },
        select: { id: true, occurredAt: true },
      });
      if (existing) {
        return {
          recorded: false,
          reason: 'duplicate',
          touchId: existing.id,
          occurredAt: existing.occurredAt,
        };
      }
    }

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
    if (duplicate)
      return { recorded: false, reason: 'duplicate', touchId: duplicate.id };

    const recentCount = await this.prisma.marketingAttributionTouch.count({
      where: {
        anonymousId: dto.anonymousId,
        occurredAt: { gte: new Date(now.getTime() - 60_000) },
      },
    });
    if (recentCount >= MAX_TOUCHES_PER_MINUTE) {
      return { recorded: false, reason: 'rate_limited' };
    }

    let touch;
    try {
      touch = await this.prisma.marketingAttributionTouch.create({
        data: {
          anonymousId: dto.anonymousId,
          idempotencyKey,
          campaignId: variant?.campaignId ?? null,
          variantId,
          landingId,
          ...this.utmData(dto, variant),
          yclid: this.text(dto.yclid),
          referrer: this.normalizeReferrer(dto.referrer),
          occurredAt: now,
        },
        select: { id: true, occurredAt: true },
      });
    } catch (error) {
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.marketingAttributionTouch.findUnique(
          {
            where: { idempotencyKey },
            select: { id: true, occurredAt: true },
          },
        );
        if (existing) {
          return {
            recorded: false,
            reason: 'duplicate',
            touchId: existing.id,
            occurredAt: existing.occurredAt,
          };
        }
      }
      throw error;
    }

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
        landing: { select: { slug: true, status: true } },
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        utmId: true,
      },
    });
    // Soft-drop unknown / archived / unpublished variants so the page hit is
    // still stored (landing-only). DRAFT/READY/ACTIVE/PAUSED all attribute.
    if (
      !variant ||
      variant.campaign.status === MarketingCampaignStatus.ARCHIVED ||
      variant.landing.status !== MarketingLandingStatus.PUBLISHED
    ) {
      return null;
    }
    if (
      dto.landingSlug &&
      dto.landingSlug.toLowerCase() !== variant.landing.slug.toLowerCase()
    ) {
      return null;
    }
    return variant;
  }

  private async resolveLandingIdBySlug(
    slugRaw: string,
  ): Promise<string | null> {
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
    variant: ResolvedVariant | null,
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
      utmSource: variant?.utmSource ?? this.sanitizeUtm(dto.utmSource, 128),
      utmMedium: variant?.utmMedium ?? this.sanitizeUtm(dto.utmMedium, 128),
      utmCampaign:
        variant?.utmCampaign ?? this.sanitizeUtm(dto.utmCampaign, 128),
      utmContent: variant?.utmContent ?? this.sanitizeUtm(dto.utmContent, 256),
      utmTerm: variant?.utmTerm ?? this.sanitizeUtm(dto.utmTerm, 256),
      utmId: variant?.utmId ?? this.sanitizeUtm(dto.utmId, 128),
    };
  }

  private sanitizeUtm(value: string | undefined, max: number): string | null {
    const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (!normalized) return null;
    return normalized.slice(0, max);
  }

  private normalizeReferrer(value?: string): string | null {
    const raw = this.text(value);
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }

  private text(value?: string): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }
}
