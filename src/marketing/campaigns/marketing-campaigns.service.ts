import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingCampaignPlatform, MarketingCampaignStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketingCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Creates a deterministic, safe URL for an already configured campaign variant. */
  async getVariantUrl(variantId: string, webOrigin: string) {
    const variant = await this.prisma.marketingCampaignVariant.findUnique({
      where: { id: variantId },
      include: { landing: { select: { slug: true, status: true } } },
    });
    if (!variant || !variant.isActive || variant.landing.status !== 'PUBLISHED') {
      throw new NotFoundException('Активный вариант опубликованного лендинга не найден');
    }
    const origin = this.normalizeWebOrigin(webOrigin);
    const url = new URL(`/l/${variant.landing.slug}`, `${origin}/`);
    url.searchParams.set('utm_source', variant.utmSource);
    url.searchParams.set('utm_medium', variant.utmMedium);
    url.searchParams.set('utm_campaign', variant.utmCampaign);
    if (variant.utmContent) url.searchParams.set('utm_content', variant.utmContent);
    if (variant.utmTerm) url.searchParams.set('utm_term', variant.utmTerm);
    if (variant.utmId) url.searchParams.set('utm_id', variant.utmId);
    url.searchParams.set('adv_variant', variant.id);
    return { url: url.toString(), variantId: variant.id };
  }

  async getVariantUrlFromConfig(variantId: string) {
    const origin = this.getPublicWebOrigin() || '';
    if (!origin) {
      throw new BadRequestException(
        'Не задан WEB_PUBLIC_URL (публичный адрес фронта, например https://adventu.ru)',
      );
    }
    return this.getVariantUrl(variantId, origin);
  }

  /** Non-secret value shown in AdminJS to explain where ad links will lead. */
  getPublicWebOrigin(): string | null {
    return (
      this.config.get<string>('WEB_PUBLIC_URL')?.trim() ||
      this.config.get<string>('PUBLIC_URL')?.trim() ||
      null
    );
  }

  /**
   * Accepts http(s) origin only (no path/query). http is allowed for local
   * (localhost / 127.0.0.1 / *.local); production must use https.
   */
  private normalizeWebOrigin(webOrigin: string): string {
    const raw = webOrigin.trim().replace(/\/$/, '');
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException(
        'Некорректный WEB_PUBLIC_URL: нужен origin вида https://adventu.ru или http://localhost:8081',
      );
    }

    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      throw new BadRequestException(
        'WEB_PUBLIC_URL не должен содержать путь — только origin (схема + хост[:порт])',
      );
    }
    if (parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new BadRequestException('WEB_PUBLIC_URL не должен содержать query/hash/credentials');
    }

    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost');

    if (parsed.protocol === 'https:') {
      // ok
    } else if (parsed.protocol === 'http:' && isLocal) {
      // ok for local/dev
    } else if (parsed.protocol === 'http:') {
      throw new BadRequestException(
        'WEB_PUBLIC_URL для продакшена должен быть https://… (http разрешён только для localhost)',
      );
    } else {
      throw new BadRequestException('WEB_PUBLIC_URL: поддерживаются только http(s)');
    }

    if (!/^[a-z0-9.-]+$/i.test(host)) {
      throw new BadRequestException('Некорректный хост в WEB_PUBLIC_URL');
    }

    return parsed.origin;
  }

  async listCampaigns(params?: { includeArchived?: boolean }) {
    const includeArchived = Boolean(params?.includeArchived);
    return this.prisma.marketingCampaign.findMany({
      where: includeArchived ? {} : { status: { not: MarketingCampaignStatus.ARCHIVED } },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        _count: { select: { variants: true, expenses: true } },
      },
    });
  }

  async getCampaign(campaignId: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: { variants: { orderBy: [{ updatedAt: 'desc' }], include: { landing: { select: { slug: true, status: true } } } } },
    });
    if (!campaign) throw new NotFoundException('Кампания не найдена');
    return campaign;
  }

  async updateCampaign(
    campaignId: string,
    patch: {
      name?: string;
      description?: string | null;
      platform?: MarketingCampaignPlatform;
      status?: MarketingCampaignStatus;
      objective?: string | null;
      plannedBudget?: number | null;
      currency?: string;
      externalCampaignId?: string | null;
      startsAt?: Date | string | null;
      endsAt?: Date | string | null;
    },
  ) {
    const existing = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Кампания не найдена');
    if (existing.status === MarketingCampaignStatus.ARCHIVED) {
      throw new BadRequestException('Архивированную кампанию нельзя редактировать');
    }

    const data: Parameters<typeof this.prisma.marketingCampaign.update>[0]['data'] =
      {};

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name || name.length > 160) throw new BadRequestException('Название кампании указано неверно');
      data.name = name;
    }

    if (patch.description !== undefined) {
      const value = patch.description == null ? null : patch.description.trim();
      if (value && value.length > 2_000) throw new BadRequestException('Описание слишком длинное');
      data.description = value || null;
    }

    if (patch.objective !== undefined) {
      const value = patch.objective == null ? null : patch.objective.trim();
      if (value && value.length > 2_000) throw new BadRequestException('Цель слишком длинная');
      data.objective = value || null;
    }

    if (patch.platform !== undefined) {
      data.platform = patch.platform;
    }

    if (patch.status !== undefined) {
      data.status = patch.status;
    }

    if (patch.currency !== undefined) {
      const currency = patch.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Некорректная валюта');
      data.currency = currency;
    }

    if (patch.externalCampaignId !== undefined) {
      const value =
        patch.externalCampaignId == null ? null : patch.externalCampaignId.trim();
      if (value && value.length > 160) throw new BadRequestException('Некорректный внешний идентификатор');
      data.externalCampaignId = value || null;
    }

    if (patch.plannedBudget !== undefined) {
      if (patch.plannedBudget == null) {
        data.plannedBudget = null;
      } else {
        const v = Number(patch.plannedBudget);
        if (!Number.isFinite(v) || v < 0) throw new BadRequestException('Некорректный бюджет');
        data.plannedBudget = new Prisma.Decimal(v);
      }
    }

    if (patch.startsAt !== undefined) {
      data.startsAt = patch.startsAt == null ? null : new Date(patch.startsAt);
      if (data.startsAt && Number.isNaN((data.startsAt as Date).getTime())) {
        throw new BadRequestException('Некорректная дата начала');
      }
    }

    if (patch.endsAt !== undefined) {
      data.endsAt = patch.endsAt == null ? null : new Date(patch.endsAt);
      if (data.endsAt && Number.isNaN((data.endsAt as Date).getTime())) {
        throw new BadRequestException('Некорректная дата окончания');
      }
    }

    return this.prisma.marketingCampaign.update({ where: { id: campaignId }, data });
  }

  async archiveCampaign(campaignId: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Кампания не найдена');
    return this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status: MarketingCampaignStatus.ARCHIVED },
    });
  }

  async listVariants(filters?: { campaignId?: string; landingId?: string }) {
    return this.prisma.marketingCampaignVariant.findMany({
      where: {
        ...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
        ...(filters?.landingId ? { landingId: filters.landingId } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        campaign: { select: { id: true, status: true, name: true, platform: true } },
        landing: { select: { id: true, slug: true, status: true, name: true } },
      },
    });
  }

  async createCampaign(input: {
    name: string;
    platform?: 'YANDEX_DIRECT' | 'TELEGRAM' | 'TIKTOK' | 'OTHER';
    description?: string;
    objective?: string;
  }) {
    const name = input.name.trim();
    if (!name || name.length > 160) throw new BadRequestException('Название кампании указано неверно');
    return this.prisma.marketingCampaign.create({
      data: { name, platform: input.platform ?? 'OTHER', description: input.description?.trim() || null, objective: input.objective?.trim() || null },
    });
  }

  async createVariant(input: {
    campaignId: string; landingId: string; name: string; utmSource: string; utmMedium: string; utmCampaign: string; utmContent?: string; utmTerm?: string; utmId?: string;
  }) {
    const [campaign, landing] = await Promise.all([
      this.prisma.marketingCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, status: true } }),
      this.prisma.marketingLanding.findUnique({ where: { id: input.landingId }, select: { id: true, status: true } }),
    ]);
    if (!campaign || campaign.status === 'ARCHIVED') throw new NotFoundException('Кампания не найдена или архивирована');
    if (!landing || landing.status === 'ARCHIVED') throw new NotFoundException('Лендинг не найден или архивирован');
    const required = [input.name, input.utmSource, input.utmMedium, input.utmCampaign].map((value) => value.trim());
    if (required.some((value) => !value || value.length > 160)) throw new BadRequestException('Название и обязательные UTM-параметры указаны неверно');

    const variant = await this.prisma.marketingCampaignVariant.create({
      data: {
        campaignId: campaign.id,
        landingId: landing.id,
        name: required[0],
        utmSource: required[1],
        utmMedium: required[2],
        utmCampaign: required[3],
        utmContent: input.utmContent?.trim() || null,
        utmTerm: input.utmTerm?.trim() || null,
        utmId: input.utmId?.trim() || null,
      },
    });

    // First tracking link ⇒ leave DRAFT so visits already count in analytics.
    if (campaign.status === MarketingCampaignStatus.DRAFT) {
      await this.prisma.marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: MarketingCampaignStatus.READY },
      });
    }

    return variant;
  }
}
