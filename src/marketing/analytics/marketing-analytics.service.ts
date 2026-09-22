import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketingCampaignPlatform, MarketingConversionType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { computeCostPer } from './marketing-analytics.util';

type AnalyticsFilters = {
  from: Date | string;
  to: Date | string;
  platform?: MarketingCampaignPlatform;
  campaignId?: string;
  landingId?: string;
  variantId?: string;
};

type OverviewPayload = {
  from: string;
  to: string;
  spendRub: number;
  views: number;
  clicks: number;
  registrations: number;
  applicationsSent: number;
  applicationsApproved: number;
  matches: number;
  cpc: number | null;
  cpr: number | null;
  cpaApplication: number | null;
  cpaApproved: number | null;
};

const FUNNEL_STEPS: MarketingConversionType[] = [
  'LANDING_VIEW',
  'CTA_CLICK',
  'REGISTRATION_STARTED',
  'REGISTRATION_COMPLETED',
  'PROFILE_CREATED',
  'GAME_PUBLISHED',
  'APPLICATION_SENT',
  'APPLICATION_APPROVED',
  'MATCH_COMPLETED',
];

@Injectable()
export class MarketingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(filters: AnalyticsFilters): Promise<OverviewPayload> {
    const { from, to } = this.parseRange(filters.from, filters.to);
    const where = await this.buildWhere(filters, from, to);

    const [spendSum, counts] = await Promise.all([
      this.prisma.marketingExpense.aggregate({
        where: where.expenses,
        _sum: { amount: true },
      }),
      this.countConversions(where.conversions, [
        'LANDING_VIEW',
        'CTA_CLICK',
        'REGISTRATION_COMPLETED',
        'APPLICATION_SENT',
        'APPLICATION_APPROVED',
        'MATCH_COMPLETED',
      ]),
    ]);

    const spendRub = Number(spendSum._sum.amount ?? 0);
    const views = counts.LANDING_VIEW ?? 0;
    const clicks = counts.CTA_CLICK ?? 0;
    const registrations = counts.REGISTRATION_COMPLETED ?? 0;
    const applicationsSent = counts.APPLICATION_SENT ?? 0;
    const applicationsApproved = counts.APPLICATION_APPROVED ?? 0;
    const matches = counts.MATCH_COMPLETED ?? 0;

    // CPC: prefer CTA_CLICK, fallback to LANDING_VIEW as a proxy if there are views.
    const cpcDenom = clicks > 0 ? clicks : views > 0 ? views : 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      spendRub,
      views,
      clicks,
      registrations,
      applicationsSent,
      applicationsApproved,
      matches,
      cpc: computeCostPer(spendRub, cpcDenom),
      cpr: computeCostPer(spendRub, registrations),
      cpaApplication: computeCostPer(spendRub, applicationsSent),
      cpaApproved: computeCostPer(spendRub, applicationsApproved),
    };
  }

  async funnel(filters: AnalyticsFilters): Promise<{
    from: string;
    to: string;
    steps: Array<{ type: MarketingConversionType; visitors: number }>;
  }> {
    const { from, to } = this.parseRange(filters.from, filters.to);
    const where = await this.buildWhere(filters, from, to);
    const rows = await this.queryUniqueVisitors(
      where.conversions,
      from,
      to,
      FUNNEL_STEPS,
      filters.platform,
    );
    const map = new Map(rows.map((r) => [r.type, r.visitors]));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      steps: FUNNEL_STEPS.map((type) => ({ type, visitors: map.get(type) ?? 0 })),
    };
  }

  async timeseries(filters: AnalyticsFilters): Promise<{
    from: string;
    to: string;
    bucket: 'day';
    points: Array<{
      t: string;
      spendRub: number;
      views: number;
      clicks: number;
      registrations: number;
      cpc: number | null;
      cpr: number | null;
    }>;
  }> {
    const { from, to } = this.parseRange(filters.from, filters.to);
    const where = await this.buildWhere(filters, from, to);

    const [spend, conv] = await Promise.all([
      this.querySpendByDay(where.expenses, from, to, filters.platform),
      this.queryConversionsByDay(where.conversions, from, to, [
        'LANDING_VIEW',
        'CTA_CLICK',
        'REGISTRATION_COMPLETED',
      ], filters.platform),
    ]);

    const keys = this.enumerateDays(from, to);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: 'day',
      points: keys.map((t) => {
        const spendRub = spend.get(t) ?? 0;
        const views = conv.get('LANDING_VIEW')?.get(t) ?? 0;
        const clicks = conv.get('CTA_CLICK')?.get(t) ?? 0;
        const registrations = conv.get('REGISTRATION_COMPLETED')?.get(t) ?? 0;
        const cpcDenom = clicks > 0 ? clicks : views > 0 ? views : 0;
        return {
          t,
          spendRub,
          views,
          clicks,
          registrations,
          cpc: computeCostPer(spendRub, cpcDenom),
          cpr: computeCostPer(spendRub, registrations),
        };
      }),
    };
  }

  async campaignDetail(
    campaignId: string,
    filters: Omit<AnalyticsFilters, 'campaignId'>,
  ) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: { variants: { orderBy: [{ updatedAt: 'desc' }], include: { landing: { select: { id: true, slug: true, status: true, name: true } } } } },
    });
    if (!campaign) throw new NotFoundException('Кампания не найдена');

    const base = await this.overview({ ...filters, campaignId });
    const perVariant = await Promise.all(
      campaign.variants.map(async (variant) => ({
        variant: {
          id: variant.id,
          name: variant.name,
          isActive: variant.isActive,
          landing: variant.landing,
        },
        overview: await this.overview({ ...filters, variantId: variant.id }),
      })),
    );

    return { campaign, overview: base, variants: perVariant };
  }

  private parseRange(fromRaw: Date | string, toRaw: Date | string) {
    const from = typeof fromRaw === 'string' ? new Date(fromRaw) : new Date(fromRaw);
    const to = typeof toRaw === 'string' ? new Date(toRaw) : new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Некорректный диапазон дат');
    }
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('Некорректный диапазон дат');
    }
    return { from, to };
  }

  private async buildWhere(filters: AnalyticsFilters, from: Date, to: Date) {
    let campaignId = filters.campaignId?.trim() || undefined;
    const variantId = filters.variantId?.trim() || undefined;
    const landingId = filters.landingId?.trim() || undefined;

    if (variantId && !campaignId) {
      const variant = await this.prisma.marketingCampaignVariant.findUnique({
        where: { id: variantId },
        select: { campaignId: true },
      });
      campaignId = variant?.campaignId;
    }

    const conversionBase: Prisma.MarketingConversionWhereInput = {
      occurredAt: { gte: from, lte: to },
      ...(campaignId ? { campaignId } : {}),
      ...(variantId ? { variantId } : {}),
      ...(landingId ? { landingId } : {}),
      ...(filters.platform
        ? { campaign: { platform: filters.platform } }
        : {}),
    };

    // Spend is campaign-scoped. When filtering by landing only, restrict to
    // campaigns that have a variant pointing at that landing — otherwise CPC
    // divides global spend by landing-local conversions.
    const expenses: Prisma.MarketingExpenseWhereInput = {
      occurredAt: { gte: from, lte: to },
    };

    if (campaignId) {
      expenses.campaignId = campaignId;
    } else if (landingId) {
      expenses.campaign = {
        ...(filters.platform ? { platform: filters.platform } : {}),
        variants: { some: { landingId } },
      };
    }

    if (filters.platform && !expenses.campaign) {
      expenses.campaign = { platform: filters.platform };
    }

    return { conversions: conversionBase, expenses };
  }

  private async countConversions(
    where: Prisma.MarketingConversionWhereInput,
    types: MarketingConversionType[],
  ): Promise<Record<string, number>> {
    const results = await Promise.all(
      types.map(async (type) => {
        const count = await this.prisma.marketingConversion.count({
          where: { ...where, type },
        });
        return [type, count] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  private enumerateDays(from: Date, to: Date): string[] {
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    const keys: string[] = [];
    for (let cursor = start; cursor.getTime() <= end.getTime(); ) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return keys;
  }

  private async querySpendByDay(
    where: Prisma.MarketingExpenseWhereInput,
    from: Date,
    to: Date,
    platform?: MarketingCampaignPlatform,
  ): Promise<Map<string, number>> {
    const landingId = this.extractLandingIdFromExpenses(where);
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; spend: number | null }>
    >`
      SELECT date_trunc('day', e."occurredAt") AS day,
             COALESCE(SUM(e.amount), 0)::float AS spend
      FROM marketing_expenses e
      WHERE e."occurredAt" >= ${from}
        AND e."occurredAt" <= ${to}
        ${where.campaignId ? Prisma.sql`AND e."campaignId" = ${where.campaignId}` : Prisma.empty}
        ${
          landingId
            ? Prisma.sql`AND e."campaignId" IN (
                SELECT "campaignId" FROM marketing_campaign_variants WHERE "landingId" = ${landingId}
              )`
            : Prisma.empty
        }
        ${
          platform
            ? Prisma.sql`AND e."campaignId" IN (SELECT id FROM marketing_campaigns WHERE platform = ${platform}::"MarketingCampaignPlatform")`
            : Prisma.empty
        }
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(new Date(row.day).toISOString().slice(0, 10), Number(row.spend ?? 0));
    }
    return map;
  }

  private extractLandingIdFromExpenses(
    where: Prisma.MarketingExpenseWhereInput,
  ): string | undefined {
    const campaign = where.campaign;
    if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
      return undefined;
    }
    const variants = (campaign as Prisma.MarketingCampaignWhereInput).variants;
    if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
      return undefined;
    }
    const some = (variants as { some?: { landingId?: string } }).some;
    return typeof some?.landingId === 'string' ? some.landingId : undefined;
  }

  private async queryConversionsByDay(
    where: Prisma.MarketingConversionWhereInput,
    from: Date,
    to: Date,
    types: MarketingConversionType[],
    platform?: MarketingCampaignPlatform,
  ): Promise<Map<MarketingConversionType, Map<string, number>>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; type: MarketingConversionType; count: number }>
    >`
      SELECT date_trunc('day', "occurredAt") AS day,
             type,
             COUNT(*)::int AS count
      FROM marketing_conversions
      WHERE "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND type = ANY(ARRAY[${Prisma.join(types)}]::"MarketingConversionType"[])
        ${where.campaignId ? Prisma.sql`AND "campaignId" = ${where.campaignId}` : Prisma.empty}
        ${where.variantId ? Prisma.sql`AND "variantId" = ${where.variantId}` : Prisma.empty}
        ${where.landingId ? Prisma.sql`AND "landingId" = ${where.landingId}` : Prisma.empty}
        ${
          platform
            ? Prisma.sql`AND "campaignId" IN (SELECT id FROM marketing_campaigns WHERE platform = ${platform}::"MarketingCampaignPlatform")`
            : Prisma.empty
        }
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;
    const byType = new Map<MarketingConversionType, Map<string, number>>();
    for (const type of types) byType.set(type, new Map());
    for (const row of rows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      const map = byType.get(row.type) ?? new Map<string, number>();
      map.set(key, Number(row.count) || 0);
      byType.set(row.type, map);
    }
    return byType;
  }

  private async queryUniqueVisitors(
    where: Prisma.MarketingConversionWhereInput,
    from: Date,
    to: Date,
    types: MarketingConversionType[],
    platform?: MarketingCampaignPlatform,
  ): Promise<Array<{ type: MarketingConversionType; visitors: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ type: MarketingConversionType; visitors: number }>
    >`
      SELECT type,
             COUNT(DISTINCT COALESCE("userId", "anonymousId"::text))::int AS visitors
      FROM marketing_conversions
      WHERE "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND type = ANY(ARRAY[${Prisma.join(types)}]::"MarketingConversionType"[])
        ${where.campaignId ? Prisma.sql`AND "campaignId" = ${where.campaignId}` : Prisma.empty}
        ${where.variantId ? Prisma.sql`AND "variantId" = ${where.variantId}` : Prisma.empty}
        ${where.landingId ? Prisma.sql`AND "landingId" = ${where.landingId}` : Prisma.empty}
        ${
          platform
            ? Prisma.sql`AND "campaignId" IN (SELECT id FROM marketing_campaigns WHERE platform = ${platform}::"MarketingCampaignPlatform")`
            : Prisma.empty
        }
      GROUP BY 1
    `;
    return rows.map((r) => ({ type: r.type, visitors: Number(r.visitors) || 0 }));
  }
}

