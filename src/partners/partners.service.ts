import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

export type PublicPartnerDto = {
  id: string;
  name: string;
  href: string;
  mark: string;
  accent: string;
  logoUrl: string | null;
};

const PARTNER_ENTITY = 'Partner';
const LOGO_COLLECTION = 'logo';

function markFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly images: ImageProcessorService,
    private readonly config: ConfigService,
  ) {}

  async listPublic(): Promise<PublicPartnerDto[]> {
    const rows = await this.prisma.partner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        href: true,
        mark: true,
        accent: true,
        logoUrl: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      href: row.href,
      mark: row.mark.trim() || markFromName(row.name),
      accent: row.accent || '#157AFE',
      logoUrl: row.logoUrl,
    }));
  }

  async uploadLogo(
    partnerId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<{ logoUrl: string }> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      throw new NotFoundException('Партнёр не найден');
    }

    const mime = file.mimetype || 'image/png';
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Нужен файл изображения');
    }

    const variants = await this.images.processImage(file.buffer, mime, [
      'original',
    ]);
    await this.media.replaceCollection(
      {
        entityType: PARTNER_ENTITY,
        entityId: partnerId,
        collection: LOGO_COLLECTION,
      },
      variants,
    );

    const logoUrl = `${this.publicLogoUrl(partnerId)}?v=${Date.now()}`;
    await this.prisma.partner.update({
      where: { id: partnerId },
      data: { logoUrl },
    });

    return { logoUrl };
  }

  async getLogoAsset(
    partnerId: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const media = await this.media.getCollection({
      entityType: PARTNER_ENTITY,
      entityId: partnerId,
      collection: LOGO_COLLECTION,
    });
    const asset =
      media.find((item) => item.variant === 'original') ?? media[0];
    if (!asset) {
      throw new NotFoundException('Логотип не найден');
    }
    return {
      body: await this.media.getObjectBuffer(asset),
      contentType: asset.mimeType,
    };
  }

  private publicLogoUrl(partnerId: string): string {
    const configured = (
      this.config.get<string>('PUBLIC_URL') ??
      process.env.PUBLIC_URL ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    if (!configured) {
      return `/api/partners/${partnerId}/logo`;
    }
    const apiBase = configured.endsWith('/api')
      ? configured
      : `${configured}/api`;
    return `${apiBase}/partners/${partnerId}/logo`;
  }
}
