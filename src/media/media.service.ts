import { Injectable } from '@nestjs/common';
import { Media, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { ImageUrls, ProcessedImageVariant } from '../image/image.types';

export type MediaEntityRef = {
  entityType: string;
  entityId: string;
  collection: string;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async replaceCollection(
    entity: MediaEntityRef,
    variants: ProcessedImageVariant[],
  ): Promise<Media[]> {
    await this.deleteCollection(entity);

    const saved: Media[] = [];

    for (const variant of variants) {
      const key = this.buildObjectKey(entity, variant.variant, variant.mimeType);
      await this.s3.putObject({
        key,
        body: variant.buffer,
        contentType: variant.mimeType,
      });

      const media = await this.prisma.media.create({
        data: {
          entityType: entity.entityType,
          entityId: entity.entityId,
          collection: entity.collection,
          variant: variant.variant,
          mimeType: variant.mimeType,
          path: key,
          width: variant.width,
          height: variant.height,
          size: variant.size,
        },
      });

      saved.push(media);
    }

    return saved;
  }

  async saveRawFile(
    entity: MediaEntityRef,
    buffer: Buffer,
    mimeType: string,
    options?: {
      variant?: string;
      fileName?: string;
      durationSec?: number | null;
      waveform?: Prisma.InputJsonValue | null;
    },
  ): Promise<Media> {
    await this.deleteCollection(entity);

    const variant = options?.variant ?? 'file';
    const extension = extensionFromMime(mimeType, options?.fileName);
    const key = [
      entity.entityType.toLowerCase(),
      entity.entityId,
      entity.collection,
      `${variant}.${extension}`,
    ].join('/');

    await this.s3.putObject({
      key,
      body: buffer,
      contentType: mimeType,
    });

    return this.prisma.media.create({
      data: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        collection: entity.collection,
        variant,
        mimeType,
        path: key,
        width: null,
        height: null,
        size: buffer.length,
        durationSec: options?.durationSec ?? null,
        waveform: options?.waveform ?? undefined,
      },
    });
  }

  async getCollection(entity: MediaEntityRef): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        collection: entity.collection,
      },
      orderBy: { variant: 'asc' },
    });
  }

  async getCollectionUrls(media: Media[]): Promise<ImageUrls> {
    const entries = await Promise.all(
      media.map(async (item) => {
        const url = await this.s3.getSignedObjectUrl(item.path);
        return [item.variant, url] as const;
      }),
    );

    return entries.reduce<ImageUrls>((urls, [variant, url]) => {
      urls[variant as keyof ImageUrls] = url;
      return urls;
    }, {});
  }

  async getPublicUrl(media: Media): Promise<string> {
    return this.s3.getSignedObjectUrl(media.path);
  }

  /** Copy all media rows for an entity onto another entity id (new S3 keys). */
  async copyEntityMedia(
    from: { entityType: string; entityId: string },
    to: { entityType: string; entityId: string },
  ): Promise<void> {
    const existing = await this.prisma.media.findMany({
      where: {
        entityType: from.entityType,
        entityId: from.entityId,
      },
      orderBy: [{ collection: 'asc' }, { variant: 'asc' }],
    });

    for (const item of existing) {
      const buffer = await this.s3.getObjectBuffer(item.path);
      const extension = item.path.split('.').pop() || 'bin';
      const key = [
        to.entityType.toLowerCase(),
        to.entityId,
        item.collection,
        `${item.variant}.${extension}`,
      ].join('/');

      await this.s3.putObject({
        key,
        body: buffer,
        contentType: item.mimeType,
      });

      await this.prisma.media.create({
        data: {
          entityType: to.entityType,
          entityId: to.entityId,
          collection: item.collection,
          variant: item.variant,
          mimeType: item.mimeType,
          path: key,
          width: item.width,
          height: item.height,
          size: item.size,
        },
      });
    }
  }

  async deleteCollection(entity: MediaEntityRef): Promise<void> {
    const existing = await this.getCollection(entity);

    if (existing.length > 0) {
      await this.s3.deleteObjects(existing.map((item) => item.path));
    }

    await this.prisma.media.deleteMany({
      where: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        collection: entity.collection,
      },
    });
  }

  private buildObjectKey(
    entity: MediaEntityRef,
    variant: string,
    mimeType: string,
  ): string {
    const extension = mimeType === 'image/webp' ? 'webp' : 'bin';
    return [
      entity.entityType.toLowerCase(),
      entity.entityId,
      entity.collection,
      `${variant}.${extension}`,
    ].join('/');
  }
}

function extensionFromMime(mimeType: string, fileName?: string): string {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) {
    return fromName;
  }

  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/json': 'json',
    'text/plain': 'txt',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  return map[mimeType] ?? 'bin';
}
