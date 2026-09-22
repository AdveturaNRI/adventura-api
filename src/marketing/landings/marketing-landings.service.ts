import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarketingLandingStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { ImageProcessorService } from '../../image/image-processor.service';
import { MediaService } from '../../media/media.service';
import { PrismaService } from '../../prisma/prisma.service';

const LANDING_ENTITY_TYPE = 'MarketingLanding';
const IMAGE_COLLECTION_PREFIX = 'image';
const ASSET_URL_PREFIX = '/marketing/landings/assets/';

@Injectable()
export class MarketingLandingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly images: ImageProcessorService,
  ) {}

  async listAdmin() {
    return this.prisma.marketingLanding.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, slug: true, status: true, description: true, draftContent: true, draftSeo: true, publishedAt: true, updatedAt: true },
    });
  }

  /** Public read model: drafts and archived pages are intentionally invisible. */
  async getPublishedBySlug(rawSlug: string) {
    const slug = rawSlug.trim().toLowerCase();
    const landing = await this.prisma.marketingLanding.findFirst({
      where: {
        slug,
        status: MarketingLandingStatus.PUBLISHED,
        publishedVersionId: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        publishedAt: true,
        publishedVersion: {
          select: {
            id: true,
            version: true,
            content: true,
            seo: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!landing?.publishedVersion) {
      throw new NotFoundException('Опубликованный лендинг не найден');
    }

    return {
      id: landing.id,
      name: landing.name,
      slug: landing.slug,
      description: landing.description,
      publishedAt: landing.publishedAt,
      version: landing.publishedVersion.version,
      content: await this.hydrateLandingAssetUrls(landing.publishedVersion.content),
      seo: landing.publishedVersion.seo,
    };
  }

  /**
   * Minimal HTML with title/description/OG/canonical for crawlers.
   * Nginx can serve this to bots for `/l/:slug` while humans get the SPA.
   */
  async renderSeoHtml(rawSlug: string, webOrigin?: string) {
    const landing = await this.getPublishedBySlug(rawSlug);
    const seo =
      landing.seo && typeof landing.seo === 'object' && !Array.isArray(landing.seo)
        ? (landing.seo as Record<string, unknown>)
        : {};
    const title = this.escapeHtml(String(seo.title ?? landing.name ?? 'Adventura'));
    const description = this.escapeHtml(
      String(seo.description ?? landing.description ?? 'Adventura — настольные ролевые игры'),
    );
    const origin = (webOrigin ?? process.env.WEB_PUBLIC_URL ?? 'https://adventu.ru').replace(
      /\/$/,
      '',
    );
    const canonical =
      typeof seo.canonical === 'string' && seo.canonical.startsWith('https://')
        ? this.escapeHtml(seo.canonical)
        : this.escapeHtml(`${origin}/l/${landing.slug}`);
    const image =
      typeof seo.image === 'string' && /^https:\/\//i.test(seo.image)
        ? this.escapeHtml(seo.image)
        : '';
    const robots = this.escapeHtml(String(seo.robots ?? 'index,follow'));
    const spaUrl = this.escapeHtml(`${origin}/l/${landing.slug}`);

    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="${robots}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonical}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ''}
  <meta http-equiv="refresh" content="0;url=${spaUrl}" />
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <p><a href="${spaUrl}">Открыть страницу</a></p>
</body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async createDraft(input: {
    name: string;
    slug: string;
    description?: string | null;
    content?: unknown;
    seo?: unknown;
  }) {
    const slug = this.normalizeSlug(input.slug);
    try {
      return await this.prisma.marketingLanding.create({
        data: {
          name: this.requiredText(input.name, 'Название'),
          slug,
          description: this.optionalText(input.description),
          draftContent: this.safeJson(input.content ?? {}),
          draftSeo: this.safeJson(input.seo ?? {}),
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Лендинг с таким URL уже существует');
      }
      throw error;
    }
  }

  async updateDraft(
    id: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      content?: unknown;
      seo?: unknown;
    },
  ) {
    await this.getLanding(id);
    const data: Prisma.MarketingLandingUpdateInput = {};
    if (input.name !== undefined) data.name = this.requiredText(input.name, 'Название');
    if (input.slug !== undefined) data.slug = this.normalizeSlug(input.slug);
    if (input.description !== undefined) data.description = this.optionalText(input.description);
    if (input.content !== undefined) data.draftContent = this.safeJson(input.content);
    if (input.seo !== undefined) data.draftSeo = this.safeJson(input.seo);
    try {
      return await this.prisma.marketingLanding.update({ where: { id }, data });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Лендинг с таким URL уже существует');
      }
      throw error;
    }
  }

  /** Freeze the current draft. Public readers can only receive this snapshot. */
  async publish(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const landing = await tx.marketingLanding.findUnique({ where: { id } });
      if (!landing) throw new NotFoundException('Лендинг не найден');
      if (landing.status === MarketingLandingStatus.ARCHIVED) {
        throw new BadRequestException('Нельзя опубликовать архивированный лендинг');
      }

      const latest = await tx.marketingLandingVersion.aggregate({
        where: { landingId: id },
        _max: { version: true },
      });
      const publishedAt = new Date();
      const version = await tx.marketingLandingVersion.create({
        data: {
          landingId: id,
          version: (latest._max.version ?? 0) + 1,
          content: this.safeJson(landing.draftContent ?? {}),
          seo: this.safeJson(landing.draftSeo ?? {}),
          publishedAt,
        },
      });
      return tx.marketingLanding.update({
        where: { id },
        data: {
          status: MarketingLandingStatus.PUBLISHED,
          publishedAt,
          publishedVersionId: version.id,
        },
      });
    });
  }

  async archive(id: string) {
    await this.getLanding(id);
    return this.prisma.marketingLanding.update({
      where: { id },
      data: { status: MarketingLandingStatus.ARCHIVED },
    });
  }

  async restoreVersion(id: string, version: number) {
    const snapshot = await this.prisma.marketingLandingVersion.findUnique({
      where: { landingId_version: { landingId: id, version } },
    });
    if (!snapshot) throw new NotFoundException('Версия лендинга не найдена');
    return this.prisma.marketingLanding.update({
      where: { id },
      data: {
        draftContent: this.safeJson(snapshot.content ?? {}),
        draftSeo: this.safeJson(snapshot.seo ?? {}),
      },
    });
  }

  async uploadImage(
    landingId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    await this.getLanding(landingId);

    const variants = await this.images.processImage(file.buffer, file.mimetype, [
      'cardThumb',
      'card',
      'original',
    ]);

    // A landing can contain a background, hero, several screenshots and
    // avatars at the same time. Give every upload its own collection so a new
    // avatar never deletes an already selected hero image from S3.
    const collection = `${IMAGE_COLLECTION_PREFIX}-${randomUUID()}`;
    const saved = await this.media.replaceCollection(
      {
        entityType: LANDING_ENTITY_TYPE,
        entityId: landingId,
        collection,
      },
      variants,
    );

    const urls = await this.media.getCollectionUrls(saved);
    // Store a stable route in landing JSON. Public landing reads replace it
    // with a freshly signed S3 URL, while the admin preview can follow it as a
    // same-origin image redirect.
    const url = `${ASSET_URL_PREFIX}${collection.slice(`${IMAGE_COLLECTION_PREFIX}-`.length)}`;
    return { ok: true as const, url, previewUrl: urls.card ?? urls.original ?? urls.cardThumb ?? null };
  }

  async getAssetUrl(assetId: string): Promise<string> {
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) {
      throw new NotFoundException('Изображение не найдено');
    }
    const collection = `${IMAGE_COLLECTION_PREFIX}-${assetId}`;
    const media = await this.prisma.media.findMany({
      where: { entityType: LANDING_ENTITY_TYPE, collection },
      orderBy: { createdAt: 'asc' },
    });
    const asset = media.find((item) => item.variant === 'card') ?? media.find((item) => item.variant === 'original') ?? media[0];
    if (!asset) throw new NotFoundException('Изображение не найдено');
    return this.media.getPublicUrl(asset);
  }

  private async hydrateLandingAssetUrls(content: unknown): Promise<unknown> {
    const cache = new Map<string, string>();
    const visit = async (value: unknown): Promise<unknown> => {
      if (typeof value === 'string' && value.startsWith(ASSET_URL_PREFIX)) {
        const assetId = value.slice(ASSET_URL_PREFIX.length);
        if (!cache.has(assetId)) cache.set(assetId, await this.getAssetUrl(assetId));
        return cache.get(assetId) ?? value;
      }
      if (Array.isArray(value)) return Promise.all(value.map(visit));
      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) result[key] = await visit(entry);
        return result;
      }
      return value;
    };
    return visit(content);
  }

  private async getLanding(id: string) {
    const landing = await this.prisma.marketingLanding.findUnique({ where: { id } });
    if (!landing) throw new NotFoundException('Лендинг не найден');
    return landing;
  }

  private normalizeSlug(value: string) {
    const slug = value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 96) {
      throw new BadRequestException('URL должен состоять из строчных латинских букв, цифр и дефисов');
    }
    return slug;
  }

  private requiredText(value: string, label: string) {
    const text = value.trim();
    if (!text || text.length > 160) throw new BadRequestException(`${label} указано неверно`);
    return text;
  }

  private optionalText(value?: string | null) {
    if (value === null || value === undefined || value.trim() === '') return null;
    if (value.length > 2_000) throw new BadRequestException('Описание слишком длинное');
    return value.trim();
  }

  private safeJson(value: unknown): Prisma.InputJsonValue {
    const raw = JSON.stringify(value);
    if (!raw || raw.length > 200_000) throw new BadRequestException('Содержимое лендинга слишком большое');
    const json = JSON.parse(raw) as unknown;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new BadRequestException('Содержимое лендинга должно быть объектом');
    }
    if (raw.includes('<script') || raw.includes('javascript:')) {
      throw new BadRequestException('Содержимое лендинга содержит недопустимый код');
    }
    return json as Prisma.InputJsonValue;
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
