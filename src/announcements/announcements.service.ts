import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteAnnouncementStatus } from '@prisma/client';

import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  DEFAULT_ANNOUNCEMENT_THEME,
  normalizeAnnouncementTheme,
  sanitizeActionUrl,
  sanitizeAnnouncementBody,
  type AnnouncementTheme,
} from './announcement-theme';

const ENTITY_TYPE = 'site_announcement';
const IMAGE_COLLECTION = 'cover';

export type AnnouncementWriteInput = {
  internalName?: string;
  title?: string;
  body?: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
  theme?: unknown;
  publishedAt?: string | Date | null;
};

export type PublicAnnouncementDto = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  publicationVersion: number;
  publishedAt: string | null;
  views: number;
  likes: number;
  theme: AnnouncementTheme;
};

/** Feed / detail for the in-app news section (likes + views). */
export type NewsItemDto = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  publicationVersion: number;
  publishedAt: string | null;
  views: number;
  likes: number;
  liked: boolean;
  /** true — пользователь ещё не прочитал эту публикацию (есть dismiss). */
  unread: boolean;
};

export type AdminAnnouncementDto = PublicAnnouncementDto & {
  internalName: string;
  status: SiteAnnouncementStatus;
  views: number;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly images: ImageProcessorService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async listAdmin(): Promise<AdminAnnouncementDto[]> {
    const rows = await this.prisma.siteAnnouncement.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
    return Promise.all(rows.map((row) => this.toAdminDto(row)));
  }

  async getAdmin(id: string): Promise<AdminAnnouncementDto> {
    const row = await this.requireAnnouncement(id);
    return this.toAdminDto(row);
  }

  async createDraft(
    input: AnnouncementWriteInput,
  ): Promise<AdminAnnouncementDto> {
    const internalName = String(input.internalName ?? '').trim();
    const title = sanitizeAnnouncementBody(input.title ?? '').trim();
    if (!internalName) {
      throw new BadRequestException('Укажите внутреннее название');
    }
    if (!title) {
      throw new BadRequestException('Укажите заголовок');
    }

    const row = await this.prisma.siteAnnouncement.create({
      data: {
        internalName,
        title,
        body: sanitizeAnnouncementBody(input.body ?? ''),
        actionLabel: this.normalizeLabel(input.actionLabel),
        actionUrl: sanitizeActionUrl(input.actionUrl),
        theme: normalizeAnnouncementTheme(
          input.theme ?? DEFAULT_ANNOUNCEMENT_THEME,
        ),
        status: SiteAnnouncementStatus.DRAFT,
      },
    });

    return this.toAdminDto(row);
  }

  async update(
    id: string,
    input: AnnouncementWriteInput,
  ): Promise<AdminAnnouncementDto> {
    await this.requireAnnouncement(id);

    const data: Record<string, unknown> = {};
    if (input.internalName !== undefined) {
      const internalName = String(input.internalName).trim();
      if (!internalName)
        throw new BadRequestException('Укажите внутреннее название');
      data.internalName = internalName;
    }
    if (input.title !== undefined) {
      const title = sanitizeAnnouncementBody(input.title).trim();
      if (!title) throw new BadRequestException('Укажите заголовок');
      data.title = title;
    }
    if (input.body !== undefined) {
      data.body = sanitizeAnnouncementBody(input.body);
    }
    if (input.actionLabel !== undefined) {
      data.actionLabel = this.normalizeLabel(input.actionLabel);
    }
    if (input.actionUrl !== undefined) {
      data.actionUrl = sanitizeActionUrl(input.actionUrl);
    }
    if (input.theme !== undefined) {
      data.theme = normalizeAnnouncementTheme(input.theme);
    }
    if (input.publishedAt !== undefined) {
      data.publishedAt = this.parseOptionalDate(input.publishedAt);
    }

    const row = await this.prisma.siteAnnouncement.update({
      where: { id },
      data,
    });
    return this.toAdminDto(row);
  }

  async publish(
    id: string,
    options?: { republish?: boolean },
  ): Promise<AdminAnnouncementDto> {
    const current = await this.requireAnnouncement(id);
    const title = current.title.trim();
    if (!title) {
      throw new BadRequestException(
        'Нельзя опубликовать объявление без заголовка',
      );
    }

    const republish = Boolean(options?.republish);
    let nextVersion = current.publicationVersion;
    if (republish) {
      nextVersion = current.publicationVersion + 1;
    } else if (current.publicationVersion < 1) {
      nextVersion = 1;
    }

    const versionChanged = nextVersion !== current.publicationVersion;
    const wasPublished = current.status === SiteAnnouncementStatus.PUBLISHED;

    const row = await this.prisma.siteAnnouncement.update({
      where: { id },
      data: {
        status: SiteAnnouncementStatus.PUBLISHED,
        publishedAt:
          republish || !current.publishedAt ? new Date() : current.publishedAt,
        publicationVersion: nextVersion,
      },
    });

    const dto = await this.toAdminDto(row);
    // Notify clients only when a new publication identity appears
    // (first publish or explicit republish), not on routine "publish" of edits.
    if (versionChanged || !wasPublished) {
      this.realtime.emitAnnouncementPublished({
        id: dto.id,
        publicationVersion: dto.publicationVersion,
      });
    }
    return dto;
  }

  async unpublish(id: string): Promise<AdminAnnouncementDto> {
    await this.requireAnnouncement(id);
    const row = await this.prisma.siteAnnouncement.update({
      where: { id },
      data: { status: SiteAnnouncementStatus.DRAFT },
    });
    return this.toAdminDto(row);
  }

  async archive(id: string): Promise<AdminAnnouncementDto> {
    await this.requireAnnouncement(id);
    const row = await this.prisma.siteAnnouncement.update({
      where: { id },
      data: { status: SiteAnnouncementStatus.ARCHIVED },
    });
    return this.toAdminDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.requireAnnouncement(id);
    await this.media.deleteEntityMedia(ENTITY_TYPE, id);
    await this.prisma.siteAnnouncement.delete({ where: { id } });
  }

  async uploadImage(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<AdminAnnouncementDto> {
    await this.requireAnnouncement(id);
    const variants = await this.images.processImage(
      file.buffer,
      file.mimetype,
      ['cardThumb', 'card', 'original'],
    );
    await this.media.replaceCollection(
      { entityType: ENTITY_TYPE, entityId: id, collection: IMAGE_COLLECTION },
      variants,
    );
    return this.getAdmin(id);
  }

  async removeImage(id: string): Promise<AdminAnnouncementDto> {
    await this.requireAnnouncement(id);
    await this.media.deleteCollection({
      entityType: ENTITY_TYPE,
      entityId: id,
      collection: IMAGE_COLLECTION,
    });
    return this.getAdmin(id);
  }

  async listNews(viewerId: string | null): Promise<NewsItemDto[]> {
    const now = new Date();
    const rows = await this.prisma.siteAnnouncement.findMany({
      where: {
        status: SiteAnnouncementStatus.PUBLISHED,
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    const likedIds = await this.getLikedAnnouncementIds(
      viewerId,
      rows.map((row) => row.id),
    );
    const dismissed = await this.getDismissedKeys(viewerId, rows);

    return Promise.all(
      rows.map((row) =>
        this.toNewsDto(
          row,
          likedIds.has(row.id),
          viewerId
            ? !dismissed.has(`${row.id}:${row.publicationVersion}`)
            : false,
        ),
      ),
    );
  }

  async getNews(
    viewerId: string | null,
    id: string,
  ): Promise<NewsItemDto> {
    const row = await this.requirePublished(id);
    if (!viewerId) {
      return this.toNewsDto(row, false, false);
    }
    const liked = await this.prisma.siteAnnouncementLike.findUnique({
      where: {
        announcementId_userId: { announcementId: id, userId: viewerId },
      },
      select: { announcementId: true },
    });
    const dismissed = await this.getDismissedKeys(viewerId, [row]);
    const unread = !dismissed.has(`${row.id}:${row.publicationVersion}`);
    return this.toNewsDto(row, Boolean(liked), unread);
  }

  async toggleLike(
    userId: string,
    id: string,
  ): Promise<{ liked: boolean; likes: number }> {
    await this.requirePublished(id);

    const existing = await this.prisma.siteAnnouncementLike.findUnique({
      where: {
        announcementId_userId: { announcementId: id, userId },
      },
    });

    if (existing) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.siteAnnouncementLike.delete({
          where: {
            announcementId_userId: { announcementId: id, userId },
          },
        }),
        this.prisma.siteAnnouncement.update({
          where: { id },
          data: { likesCount: { decrement: 1 } },
          select: { likesCount: true },
        }),
      ]);
      return { liked: false, likes: Math.max(0, updated.likesCount) };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.siteAnnouncementLike.create({
        data: { announcementId: id, userId },
      }),
      this.prisma.siteAnnouncement.update({
        where: { id },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      }),
    ]);

    return { liked: true, likes: updated.likesCount };
  }

  async incrementViews(id: string): Promise<{ views: number }> {
    await this.requirePublished(id);
    const updated = await this.prisma.siteAnnouncement.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return { views: updated.views };
  }

  async listPendingForUser(userId: string): Promise<PublicAnnouncementDto[]> {
    const now = new Date();
    const published = await this.prisma.siteAnnouncement.findMany({
      where: {
        status: SiteAnnouncementStatus.PUBLISHED,
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
      },
      // Newest first: client shows at most one per session.
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    if (published.length === 0) return [];

    const dismissed = await this.getDismissedKeys(userId, published);
    const pending = published.filter(
      (item) => !dismissed.has(`${item.id}:${item.publicationVersion}`),
    );

    return Promise.all(pending.map((row) => this.toPublicDto(row)));
  }

  /** Dev/seed helper: nudge connected clients to reload pending announcements. */
  notifyPublished(id: string, publicationVersion: number) {
    this.realtime.emitAnnouncementPublished({ id, publicationVersion });
    return { ok: true as const, id, publicationVersion };
  }

  async dismissForUser(
    userId: string,
    announcementId: string,
    publicationVersion: number,
  ): Promise<{ ok: true }> {
    const row = await this.prisma.siteAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!row || row.status !== SiteAnnouncementStatus.PUBLISHED) {
      throw new NotFoundException('Объявление не найдено');
    }
    if (row.publicationVersion !== publicationVersion) {
      // Stale client version — treat as already handled for this payload.
      return { ok: true };
    }

    await this.prisma.siteAnnouncementDismissal.upsert({
      where: {
        userId_announcementId_publicationVersion: {
          userId,
          announcementId,
          publicationVersion,
        },
      },
      create: {
        userId,
        announcementId,
        publicationVersion,
      },
      update: {
        dismissedAt: new Date(),
      },
    });

    return { ok: true };
  }

  private async requireAnnouncement(id: string) {
    const row = await this.prisma.siteAnnouncement.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Объявление не найдено');
    return row;
  }

  private async requirePublished(id: string) {
    const row = await this.requireAnnouncement(id);
    const now = new Date();
    if (
      row.status !== SiteAnnouncementStatus.PUBLISHED ||
      (row.publishedAt != null && row.publishedAt > now)
    ) {
      throw new NotFoundException('Новость не найдена');
    }
    return row;
  }

  private async getLikedAnnouncementIds(
    viewerId: string | null,
    announcementIds: string[],
  ): Promise<Set<string>> {
    if (!viewerId || announcementIds.length === 0) {
      return new Set();
    }
    const likes = await this.prisma.siteAnnouncementLike.findMany({
      where: {
        userId: viewerId,
        announcementId: { in: announcementIds },
      },
      select: { announcementId: true },
    });
    return new Set(likes.map((like) => like.announcementId));
  }

  private normalizeLabel(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const label = String(value).trim();
    if (!label) return null;
    return label.slice(0, 80);
  }

  private parseOptionalDate(value: string | Date | null): Date | null {
    if (value === null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new BadRequestException('Некорректная дата публикации');
      }
      return value;
    }
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректная дата публикации');
    }
    return parsed;
  }

  private async resolveImageUrl(entityId: string): Promise<string | null> {
    const media = await this.media.getCollection({
      entityType: ENTITY_TYPE,
      entityId,
      collection: IMAGE_COLLECTION,
    });
    if (media.length === 0) return null;
    const urls = await this.media.getCollectionUrls(media);
    return urls.card ?? urls.original ?? urls.cardThumb ?? null;
  }

  private async toPublicDto(row: {
    id: string;
    title: string;
    body: string;
    actionLabel: string | null;
    actionUrl: string | null;
    publicationVersion: number;
    publishedAt: Date | null;
    views?: number;
    likesCount?: number;
    theme: unknown;
  }): Promise<PublicAnnouncementDto> {
    const theme = normalizeAnnouncementTheme(row.theme);
    const imageUrl = theme.showImage
      ? await this.resolveImageUrl(row.id)
      : null;
    const actionUrl = sanitizeActionUrl(row.actionUrl);
    const actionLabel = this.normalizeLabel(row.actionLabel);

    return {
      id: row.id,
      title: sanitizeAnnouncementBody(row.title),
      body: sanitizeAnnouncementBody(row.body),
      imageUrl,
      actionLabel: theme.showActionButton ? actionLabel : null,
      actionUrl: theme.showActionButton ? actionUrl : null,
      publicationVersion: row.publicationVersion,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      views: Math.max(0, row.views ?? 0),
      likes: Math.max(0, row.likesCount ?? 0),
      theme,
    };
  }

  private async getDismissedKeys(
    userId: string | null,
    rows: Array<{ id: string; publicationVersion: number }>,
  ): Promise<Set<string>> {
    if (!userId || rows.length === 0) return new Set();
    const dismissals = await this.prisma.siteAnnouncementDismissal.findMany({
      where: {
        userId,
        OR: rows.map((item) => ({
          announcementId: item.id,
          publicationVersion: item.publicationVersion,
        })),
      },
      select: { announcementId: true, publicationVersion: true },
    });
    return new Set(
      dismissals.map((d) => `${d.announcementId}:${d.publicationVersion}`),
    );
  }

  private async toNewsDto(
    row: {
      id: string;
      title: string;
      body: string;
      actionLabel: string | null;
      actionUrl: string | null;
      publicationVersion: number;
      publishedAt: Date | null;
      views: number;
      likesCount: number;
    },
    liked: boolean,
    unread: boolean,
  ): Promise<NewsItemDto> {
    return {
      id: row.id,
      title: sanitizeAnnouncementBody(row.title),
      body: sanitizeAnnouncementBody(row.body),
      imageUrl: await this.resolveImageUrl(row.id),
      actionLabel: this.normalizeLabel(row.actionLabel),
      actionUrl: sanitizeActionUrl(row.actionUrl),
      publicationVersion: row.publicationVersion,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      views: row.views,
      likes: Math.max(0, row.likesCount),
      liked,
      unread,
    };
  }

  private async toAdminDto(row: {
    id: string;
    internalName: string;
    title: string;
    body: string;
    actionLabel: string | null;
    actionUrl: string | null;
    status: SiteAnnouncementStatus;
    publicationVersion: number;
    publishedAt: Date | null;
    views: number;
    likesCount: number;
    theme: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<AdminAnnouncementDto> {
    const publicDto = await this.toPublicDto(row);
    return {
      ...publicDto,
      // Admin preview always sees image/action regardless of hide flags in theme,
      // but we still apply theme flags for the live modal payload shape.
      imageUrl: await this.resolveImageUrl(row.id),
      actionLabel: this.normalizeLabel(row.actionLabel),
      actionUrl: sanitizeActionUrl(row.actionUrl),
      internalName: row.internalName,
      status: row.status,
      views: row.views,
      likesCount: Math.max(0, row.likesCount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
