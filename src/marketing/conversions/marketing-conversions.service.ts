import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MarketingCampaignStatus,
  MarketingLandingStatus,
  Prisma,
  type MarketingConversionType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CONVERSIONS_PER_MINUTE = 40;

/** Hits that must not inherit campaign from last-touch without an explicit variant. */
const EXPLICIT_VARIANT_ONLY_TYPES: ReadonlySet<MarketingConversionType> =
  new Set(['LANDING_VIEW', 'CTA_CLICK']);

type ResolvedVariant = {
  id: string;
  campaignId: string;
  landingId: string;
  campaign: { status: MarketingCampaignStatus };
  landing: { slug: string; status: MarketingLandingStatus };
};

type TouchSnapshot = {
  id: string;
  occurredAt: Date;
  campaignId: string | null;
  variantId: string | null;
  landingId: string | null;
};

@Injectable()
export class MarketingConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordConversion(input: {
    type: MarketingConversionType;
    anonymousId?: string;
    userId?: string;
    landingId?: string;
    variantId?: string;
    landingSlug?: string;
    idempotencyKey: string;
    props?: Record<string, unknown> | Prisma.InputJsonValue;
  }) {
    const now = new Date();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw new BadRequestException('Некорректный ключ идемпотентности');
    }

    const existing = await this.prisma.marketingConversion.findUnique({
      where: { idempotencyKey },
      select: { id: true, occurredAt: true },
    });
    if (existing) {
      return {
        recorded: false as const,
        reason: 'duplicate' as const,
        conversionId: existing.id,
        occurredAt: existing.occurredAt,
      };
    }

    const anonymousId = input.anonymousId?.trim() || null;
    const userId = input.userId?.trim() || null;
    const landingSlug = input.landingSlug?.trim() || null;

    if (!anonymousId && !userId) {
      throw new BadRequestException('Не указан идентификатор посетителя');
    }

    if (anonymousId) {
      const recentCount = await this.prisma.marketingConversion.count({
        where: {
          anonymousId,
          occurredAt: { gte: new Date(now.getTime() - 60_000) },
        },
      });
      if (recentCount >= MAX_CONVERSIONS_PER_MINUTE) {
        return { recorded: false as const, reason: 'rate_limited' as const };
      }
    }

    const variant = await this.resolveVariant({
      variantId: input.variantId,
      landingSlug,
    });

    const landingId =
      variant?.landingId ??
      (input.landingId?.trim() || null) ??
      (landingSlug
        ? await this.resolvePublishedLandingIdBySlug(landingSlug)
        : null);

    const attribution = await this.resolveAttribution({
      userId,
      anonymousId,
      windowFrom: new Date(now.getTime() - ATTRIBUTION_WINDOW_MS),
    });

    const inheritLastTouch = !EXPLICIT_VARIANT_ONLY_TYPES.has(input.type);
    const campaignId =
      variant?.campaignId ??
      (inheritLastTouch ? (attribution.lastTouch?.campaignId ?? null) : null);
    const variantId =
      variant?.id ??
      (inheritLastTouch ? (attribution.lastTouch?.variantId ?? null) : null);
    const touchId = attribution.lastTouch?.id ?? null;

    const props = this.safeProps({
      props: input.props,
      attribution: {
        model: 'last_touch',
        windowDays: 30,
        firstTouch: attribution.firstTouch
          ? {
              id: attribution.firstTouch.id,
              occurredAt: attribution.firstTouch.occurredAt,
              campaignId: attribution.firstTouch.campaignId,
              variantId: attribution.firstTouch.variantId,
              landingId: attribution.firstTouch.landingId,
            }
          : null,
      },
    });

    try {
      const created = await this.prisma.marketingConversion.create({
        data: {
          type: input.type,
          anonymousId,
          userId,
          landingId,
          campaignId,
          variantId,
          touchId,
          attributionModel: 'last_touch',
          idempotencyKey,
          occurredAt: now,
          props,
        },
        select: { id: true, occurredAt: true },
      });

      return {
        recorded: true as const,
        conversionId: created.id,
        occurredAt: created.occurredAt,
        attributionModel: 'last_touch' as const,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const duplicate = await this.prisma.marketingConversion.findUnique({
          where: { idempotencyKey },
          select: { id: true, occurredAt: true },
        });
        if (duplicate) {
          return {
            recorded: false as const,
            reason: 'duplicate' as const,
            conversionId: duplicate.id,
            occurredAt: duplicate.occurredAt,
          };
        }
      }
      throw error;
    }
  }

  private async resolveVariant(input: {
    variantId?: string;
    landingSlug?: string | null;
  }): Promise<ResolvedVariant | null> {
    if (!input.variantId) return null;

    const variant = await this.prisma.marketingCampaignVariant.findFirst({
      where: { id: input.variantId, isActive: true },
      select: {
        id: true,
        campaignId: true,
        landingId: true,
        campaign: { select: { status: true } },
        landing: { select: { slug: true, status: true } },
      },
    });

    // Soft-drop bad variants so the conversion is still stored (landing-only).
    // DRAFT/READY/ACTIVE/PAUSED/COMPLETED all attribute; only ARCHIVED is out.
    if (
      !variant ||
      variant.campaign.status === MarketingCampaignStatus.ARCHIVED ||
      variant.landing.status !== MarketingLandingStatus.PUBLISHED
    ) {
      return null;
    }

    if (
      input.landingSlug &&
      input.landingSlug.toLowerCase() !== variant.landing.slug.toLowerCase()
    ) {
      return null;
    }

    return variant;
  }

  private async resolvePublishedLandingIdBySlug(
    slugRaw: string,
  ): Promise<string> {
    const slug = slugRaw.trim().toLowerCase();
    const landing = await this.prisma.marketingLanding.findFirst({
      where: {
        slug,
        status: MarketingLandingStatus.PUBLISHED,
        publishedVersionId: { not: null },
      },
      select: { id: true },
    });
    if (!landing)
      throw new BadRequestException('Опубликованный лендинг не найден');
    return landing.id;
  }

  private async resolveAttribution(input: {
    userId: string | null;
    anonymousId: string | null;
    windowFrom: Date;
  }): Promise<{
    firstTouch: TouchSnapshot | null;
    lastTouch: TouchSnapshot | null;
  }> {
    const identityOr: Prisma.MarketingAttributionTouchWhereInput[] = [];
    if (input.userId) identityOr.push({ userId: input.userId });
    if (input.anonymousId) identityOr.push({ anonymousId: input.anonymousId });

    if (!identityOr.length) {
      return { firstTouch: null, lastTouch: null };
    }

    const whereBase: Prisma.MarketingAttributionTouchWhereInput =
      identityOr.length === 1 ? identityOr[0]! : { OR: identityOr };

    const touchSelect = {
      id: true,
      occurredAt: true,
      campaignId: true,
      variantId: true,
      landingId: true,
    } as const;

    const [firstTouch, lastTouch] = await Promise.all([
      this.prisma.marketingAttributionTouch.findFirst({
        where: whereBase,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: touchSelect,
      }),
      this.prisma.marketingAttributionTouch.findFirst({
        where: { ...whereBase, occurredAt: { gte: input.windowFrom } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: touchSelect,
      }),
    ]);

    return {
      firstTouch: firstTouch ?? null,
      lastTouch: lastTouch ?? null,
    };
  }

  private safeProps(value: unknown): Prisma.InputJsonValue {
    const raw = JSON.stringify(value ?? {});
    if (!raw || raw.length > 100_000) {
      throw new BadRequestException('props слишком большой');
    }
    return JSON.parse(raw) as Prisma.InputJsonValue;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
