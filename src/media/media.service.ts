import { join } from 'path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Media } from '@prisma/client';
import { promises as fs } from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import type { ImageUrls, ProcessedImageVariant } from '../image/image.types';

export type MediaEntityRef = {
  entityType: string;
  entityId: string;
  collection: string;
};

@Injectable()
export class MediaService {
  private readonly uploadsRoot: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.uploadsRoot = configService.get<string>(
      'UPLOADS_DIR',
      join(process.cwd(), 'uploads'),
    );
    this.publicBaseUrl = configService
      .get<string>('PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
  }

  async replaceCollection(
    entity: MediaEntityRef,
    variants: ProcessedImageVariant[],
  ): Promise<Media[]> {
    await this.deleteCollection(entity);

    const saved: Media[] = [];

    for (const variant of variants) {
      const relativePath = this.buildRelativePath(
        entity,
        variant.variant,
        variant.mimeType,
      );
      const absolutePath = join(this.uploadsRoot, relativePath);

      await fs.mkdir(join(absolutePath, '..'), { recursive: true });
      await fs.writeFile(absolutePath, variant.buffer);

      const media = await this.prisma.media.create({
        data: {
          entityType: entity.entityType,
          entityId: entity.entityId,
          collection: entity.collection,
          variant: variant.variant,
          mimeType: variant.mimeType,
          path: relativePath,
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
    options?: { variant?: string; fileName?: string },
  ): Promise<Media> {
    await this.deleteCollection(entity);

    const variant = options?.variant ?? 'file';
    const extension = extensionFromMime(mimeType, options?.fileName);
    const relativePath = join(
      entity.entityType.toLowerCase(),
      entity.entityId,
      entity.collection,
      `${variant}.${extension}`,
    );
    const absolutePath = join(this.uploadsRoot, relativePath);

    await fs.mkdir(join(absolutePath, '..'), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return this.prisma.media.create({
      data: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        collection: entity.collection,
        variant,
        mimeType,
        path: relativePath,
        width: null,
        height: null,
        size: buffer.length,
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

  getCollectionUrls(media: Media[]): ImageUrls {
    return media.reduce<ImageUrls>((urls, item) => {
      urls[item.variant as keyof ImageUrls] = this.toPublicUrl(item.path);
      return urls;
    }, {});
  }

  getPublicUrl(media: Media): string {
    return this.toPublicUrl(media.path);
  }

  async deleteCollection(entity: MediaEntityRef): Promise<void> {
    const existing = await this.getCollection(entity);

    await Promise.all(
      existing.map(async (item) => {
        const absolutePath = join(this.uploadsRoot, item.path);
        await fs.unlink(absolutePath).catch(() => undefined);
      }),
    );

    await this.prisma.media.deleteMany({
      where: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        collection: entity.collection,
      },
    });
  }

  private buildRelativePath(
    entity: MediaEntityRef,
    variant: string,
    mimeType: string,
  ): string {
    const extension = mimeType === 'image/webp' ? 'webp' : 'bin';
    return join(
      entity.entityType.toLowerCase(),
      entity.entityId,
      entity.collection,
      `${variant}.${extension}`,
    );
  }

  private toPublicUrl(relativePath: string): string {
    return `${this.publicBaseUrl}/uploads/${relativePath.replace(/\\/g, '/')}`;
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
