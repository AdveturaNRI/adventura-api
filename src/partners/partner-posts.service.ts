import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

/** How long a published post stays in the sidebar when it has no `expiresAt`. */
export const PARTNER_POST_FRESH_DAYS = 7;

const POST_ENTITY = 'PartnerPost';
const COVER_COLLECTION = 'cover';
const DAY_MS = 24 * 60 * 60 * 1000;

export type PublicPartnerPostDto = {
  id: string;
  partnerId: string;
  title: string;
  body: string;
  coverUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  publishedAt: string;
  partner: {
    id: string;
    name: string;
    href: string;
    accent: string;
    logoUrl: string | null;
  };
};

const publicSelect = {
  id: true,
  partnerId: true,
  title: true,
  body: true,
  coverUrl: true,
  actionLabel: true,
  actionUrl: true,
  publishedAt: true,
  partner: {
    select: { id: true, name: true, href: true, accent: true, logoUrl: true },
  },
} satisfies Prisma.PartnerPostSelect;

type PublicRow = Prisma.PartnerPostGetPayload<{ select: typeof publicSelect }>;

function toPublic(row: PublicRow): PublicPartnerPostDto {
  return {
    id: row.id,
    partnerId: row.partnerId,
    title: row.title,
    body: row.body,
    coverUrl: row.coverUrl,
    actionLabel: row.actionLabel?.trim() || null,
    actionUrl: row.actionUrl?.trim() || null,
    publishedAt: (row.publishedAt ?? new Date()).toISOString(),
    partner: {
      ...row.partner,
      accent: row.partner.accent || '#157AFE',
    },
  };
}

/** Published, not expired, and either within `expiresAt` or the fresh window. */
function liveWhere(now: Date): Prisma.PartnerPostWhereInput {
  return {
    status: 'PUBLISHED',
    partner: { isActive: true },
    OR: [
      { expiresAt: { gt: now } },
      {
        expiresAt: null,
        publishedAt: {
          gt: new Date(now.getTime() - PARTNER_POST_FRESH_DAYS * DAY_MS),
        },
      },
    ],
  };
}

@Injectable()
export class PartnerPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly images: ImageProcessorService,
    private readonly config: ConfigService,
  ) {}

  /** The newest live post of each partner: one sidebar slot per partner. */
  async listLive(): Promise<PublicPartnerPostDto[]> {
    const rows = await this.prisma.partnerPost.findMany({
      where: liveWhere(new Date()),
      orderBy: { publishedAt: 'desc' },
      select: publicSelect,
    });
    const seen = new Set<string>();
    return rows
      .filter((row) => {
        if (seen.has(row.partnerId)) return false;
        seen.add(row.partnerId);
        return true;
      })
      .map(toPublic);
  }

  /** Expired posts stay readable by direct link; drafts and archived ones do not. */
  async getPublished(id: string): Promise<PublicPartnerPostDto> {
    const row = await this.prisma.partnerPost.findFirst({
      where: { id, status: 'PUBLISHED', partner: { isActive: true } },
      select: publicSelect,
    });
    if (!row) throw new NotFoundException('Новость не найдена');
    return toPublic(row);
  }

  async track(id: string, kind: 'view' | 'click'): Promise<{ ok: true }> {
    await this.prisma.partnerPost.updateMany({
      where: { id, status: 'PUBLISHED' },
      data:
        kind === 'view'
          ? { views: { increment: 1 } }
          : { clicks: { increment: 1 } },
    });
    return { ok: true };
  }

  /**
   * Admin save hook: stamps `publishedAt` on (re)publish and archives the partner's
   * previous published post, so each partner has one live post at a time.
   */
  async afterSave(id: string): Promise<void> {
    const post = await this.prisma.partnerPost.findUnique({
      where: { id },
      select: { id: true, partnerId: true, status: true, publishedAt: true },
    });
    if (!post || post.status !== 'PUBLISHED') return;
    await this.prisma.$transaction([
      ...(post.publishedAt
        ? []
        : [
            this.prisma.partnerPost.update({
              where: { id },
              data: { publishedAt: new Date() },
            }),
          ]),
      this.prisma.partnerPost.updateMany({
        where: {
          partnerId: post.partnerId,
          status: 'PUBLISHED',
          id: { not: id },
        },
        data: { status: 'ARCHIVED' },
      }),
    ]);
  }

  async uploadCover(
    postId: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<{ coverUrl: string }> {
    const post = await this.prisma.partnerPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Новость не найдена');

    const mime = file.mimetype || 'image/png';
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Нужен файл изображения');
    }

    const variants = await this.images.processImage(file.buffer, mime, [
      'original',
    ]);
    await this.media.replaceCollection(
      {
        entityType: POST_ENTITY,
        entityId: postId,
        collection: COVER_COLLECTION,
      },
      variants,
    );

    const coverUrl = `${this.publicCoverUrl(postId)}?v=${Date.now()}`;
    await this.prisma.partnerPost.update({
      where: { id: postId },
      data: { coverUrl },
    });
    return { coverUrl };
  }

  async getCoverAsset(
    postId: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const media = await this.media.getCollection({
      entityType: POST_ENTITY,
      entityId: postId,
      collection: COVER_COLLECTION,
    });
    const asset = media.find((item) => item.variant === 'original') ?? media[0];
    if (!asset) throw new NotFoundException('Обложка не найдена');
    return {
      body: await this.media.getObjectBuffer(asset),
      contentType: asset.mimeType,
    };
  }

  private publicCoverUrl(postId: string): string {
    const configured = (
      this.config.get<string>('PUBLIC_URL') ??
      process.env.PUBLIC_URL ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    if (!configured) return `/api/partners/news/${postId}/cover`;
    const apiBase = configured.endsWith('/api')
      ? configured
      : `${configured}/api`;
    return `${apiBase}/partners/news/${postId}/cover`;
  }
}
