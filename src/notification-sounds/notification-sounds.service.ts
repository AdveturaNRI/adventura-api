import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFICATION_SOUND_ENTITY = 'NotificationSoundPreset';
export const NOTIFICATION_SOUND_COLLECTION = 'sound';
export const USER_CUSTOM_SOUND_COLLECTION = 'notificationSound';
export const USER_ENTITY_TYPE = 'User';

const MAX_NOTIFICATION_SOUND_BYTES = 256 * 1024;
const ALLOWED_SOUND_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
]);

export type NotificationSoundPresetDto = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  url: string;
};

@Injectable()
export class NotificationSoundsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSoundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeedMedia();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Не удалось залить seed-звуки в S3 — пресеты без URL, пока не починится сторадж: ${message}`,
      );
    }
  }

  private resolveSeedDir() {
    const candidates = [
      join(process.cwd(), 'prisma/seed-sounds'),
      join(process.cwd(), 'dist/prisma/seed-sounds'),
    ];
    return candidates.find((dir) => existsSync(dir)) ?? null;
  }

  /** Upload bundled mp3 into S3 once so audio URLs work without client static files. */
  private async ensureSeedMedia() {
    const seedDir = this.resolveSeedDir();
    if (!seedDir) {
      return;
    }

    const presets = await this.prisma.notificationSoundPreset.findMany({
      where: { isActive: true },
    });

    for (const preset of presets) {
      const existing = await this.mediaService.getCollection({
        entityType: NOTIFICATION_SOUND_ENTITY,
        entityId: preset.id,
        collection: NOTIFICATION_SOUND_COLLECTION,
      });
      if (existing.length > 0) {
        continue;
      }

      const fileName = `notify-${preset.slug}.mp3`;
      const filePath = join(seedDir, fileName);
      if (!existsSync(filePath)) {
        continue;
      }

      const buffer = readFileSync(filePath);
      await this.mediaService.saveRawFile(
        {
          entityType: NOTIFICATION_SOUND_ENTITY,
          entityId: preset.id,
          collection: NOTIFICATION_SOUND_COLLECTION,
        },
        buffer,
        'audio/mpeg',
        { fileName },
      );
    }
  }

  assertAudioFile(file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Аудиофайл не передан');
    }
    if (file.size > MAX_NOTIFICATION_SOUND_BYTES) {
      throw new BadRequestException('Звук слишком большой (макс. 256 КБ)');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_SOUND_MIME.has(mime) && !mime.startsWith('audio/')) {
      throw new BadRequestException('Нужен аудиофайл (mp3/ogg/wav/webm)');
    }
  }

  async getDefaultPreset() {
    const byFlag = await this.prisma.notificationSoundPreset.findFirst({
      where: { isDefault: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (byFlag) {
      return byFlag;
    }
    return this.prisma.notificationSoundPreset.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async resolvePresetAudioUrl(presetId: string): Promise<string | null> {
    const preset = await this.prisma.notificationSoundPreset.findUnique({
      where: { id: presetId },
      select: { staticPath: true },
    });
    if (preset?.staticPath) {
      return preset.staticPath;
    }

    const media = await this.mediaService.getCollection({
      entityType: NOTIFICATION_SOUND_ENTITY,
      entityId: presetId,
      collection: NOTIFICATION_SOUND_COLLECTION,
    });
    const primary = media[0];
    if (primary) {
      return this.mediaService.getPublicUrl(primary);
    }
    return null;
  }

  async resolveCustomAudioUrl(userId: string): Promise<string | null> {
    const media = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: USER_CUSTOM_SOUND_COLLECTION,
    });
    const primary = media[0];
    if (!primary) {
      return null;
    }
    return this.mediaService.getPublicUrl(primary);
  }

  async listPublicPresets(): Promise<NotificationSoundPresetDto[]> {
    const presets = await this.prisma.notificationSoundPreset.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const items: NotificationSoundPresetDto[] = [];
    for (const preset of presets) {
      const url = await this.resolvePresetAudioUrl(preset.id);
      if (!url) {
        continue;
      }
      items.push({
        id: preset.id,
        slug: preset.slug,
        label: preset.label,
        description: preset.description,
        sortOrder: preset.sortOrder,
        isDefault: preset.isDefault,
        url,
      });
    }
    return items;
  }

  async listAdmin() {
    const presets = await this.prisma.notificationSoundPreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const items = [];
    for (const preset of presets) {
      const media = await this.mediaService.getCollection({
        entityType: NOTIFICATION_SOUND_ENTITY,
        entityId: preset.id,
        collection: NOTIFICATION_SOUND_COLLECTION,
      });
      const url = media[0]
        ? await this.mediaService.getPublicUrl(media[0])
        : preset.staticPath;
      items.push({
        ...preset,
        hasAudio: Boolean(media[0] || preset.staticPath),
        audioUrl: url,
        size: media[0]?.size ?? null,
      });
    }
    return items;
  }

  private normalizeSlug(raw: string) {
    const slug = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    if (!slug) {
      throw new BadRequestException('Укажите slug');
    }
    return slug;
  }

  async createPreset(input: {
    slug: string;
    label: string;
    description?: string | null;
    sortOrder?: number;
    isDefault?: boolean;
    file?: Express.Multer.File | { buffer: Buffer; mimetype: string; originalname?: string };
  }) {
    const slug = this.normalizeSlug(input.slug);
    const label = input.label?.trim();
    if (!label) {
      throw new BadRequestException('Укажите название');
    }

    const existing = await this.prisma.notificationSoundPreset.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new BadRequestException('Такой slug уже есть');
    }

    const preset = await this.prisma.notificationSoundPreset.create({
      data: {
        slug,
        label,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 100,
        isDefault: false,
        isActive: true,
      },
    });

    if (input.file) {
      await this.savePresetFile(preset.id, input.file);
    }

    if (input.isDefault) {
      await this.setDefault(preset.id);
    }

    return this.getAdminItem(preset.id);
  }

  async updatePreset(
    id: string,
    input: {
      label?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
      isDefault?: boolean;
      file?: Express.Multer.File | { buffer: Buffer; mimetype: string; originalname?: string };
    },
  ) {
    const preset = await this.prisma.notificationSoundPreset.findUnique({
      where: { id },
    });
    if (!preset) {
      throw new NotFoundException('Пресет не найден');
    }

    await this.prisma.notificationSoundPreset.update({
      where: { id },
      data: {
        label: input.label?.trim() || undefined,
        description:
          input.description !== undefined
            ? input.description?.trim() || null
            : undefined,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });

    if (input.file) {
      await this.savePresetFile(id, input.file);
      await this.prisma.notificationSoundPreset.update({
        where: { id },
        data: { staticPath: null },
      });
    }

    if (input.isDefault) {
      await this.setDefault(id);
    }

    return this.getAdminItem(id);
  }

  async savePresetFile(
    presetId: string,
    file: Express.Multer.File | { buffer: Buffer; mimetype: string; originalname?: string; size?: number },
  ) {
    const asMulter = file as Express.Multer.File;
    this.assertAudioFile({
      ...asMulter,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size ?? file.buffer.length,
      originalname: file.originalname,
    } as Express.Multer.File);

    await this.mediaService.saveRawFile(
      {
        entityType: NOTIFICATION_SOUND_ENTITY,
        entityId: presetId,
        collection: NOTIFICATION_SOUND_COLLECTION,
      },
      file.buffer,
      file.mimetype || 'audio/mpeg',
      { fileName: file.originalname || 'notify.mp3' },
    );
  }

  async setDefault(id: string) {
    const preset = await this.prisma.notificationSoundPreset.findUnique({
      where: { id },
    });
    if (!preset || !preset.isActive) {
      throw new NotFoundException('Пресет не найден');
    }

    const previousDefault = await this.prisma.notificationSoundPreset.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationSoundPreset.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      await tx.notificationSoundPreset.update({
        where: { id },
        data: { isDefault: true },
      });

      // Только у тех, у кого стоял прежний дефолт (и не свой файл).
      if (previousDefault && previousDefault.id !== id) {
        await tx.user.updateMany({
          where: {
            notificationSoundPresetId: previousDefault.id,
            useCustomNotificationSound: false,
          },
          data: { notificationSoundPresetId: id },
        });
      }
    });

    return this.getAdminItem(id);
  }

  async deletePreset(id: string) {
    const preset = await this.prisma.notificationSoundPreset.findUnique({
      where: { id },
    });
    if (!preset) {
      throw new NotFoundException('Пресет не найден');
    }

    const defaultPreset = await this.getDefaultPreset();
    if (defaultPreset?.id === id) {
      const replacement = await this.prisma.notificationSoundPreset.findFirst({
        where: { id: { not: id }, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (!replacement) {
        throw new BadRequestException('Нельзя удалить последний активный пресет');
      }
      await this.setDefault(replacement.id);
    }

    const fallback = await this.getDefaultPreset();
    if (fallback) {
      await this.prisma.user.updateMany({
        where: { notificationSoundPresetId: id },
        data: { notificationSoundPresetId: fallback.id },
      });
    } else {
      await this.prisma.user.updateMany({
        where: { notificationSoundPresetId: id },
        data: { notificationSoundPresetId: null },
      });
    }

    await this.mediaService.deleteCollection({
      entityType: NOTIFICATION_SOUND_ENTITY,
      entityId: id,
      collection: NOTIFICATION_SOUND_COLLECTION,
    });

    await this.prisma.notificationSoundPreset.delete({ where: { id } });
    return { ok: true };
  }

  private async getAdminItem(id: string) {
    const list = await this.listAdmin();
    const item = list.find((row) => row.id === id);
    if (!item) {
      throw new NotFoundException('Пресет не найден');
    }
    return item;
  }

  async uploadUserCustomSound(userId: string, file: Express.Multer.File) {
    this.assertAudioFile(file);
    await this.mediaService.saveRawFile(
      {
        entityType: USER_ENTITY_TYPE,
        entityId: userId,
        collection: USER_CUSTOM_SOUND_COLLECTION,
      },
      file.buffer,
      file.mimetype || 'audio/mpeg',
      { fileName: file.originalname || 'custom.mp3' },
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { useCustomNotificationSound: true },
    });
  }

  async deleteUserCustomSound(userId: string) {
    await this.mediaService.deleteCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: USER_CUSTOM_SOUND_COLLECTION,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { useCustomNotificationSound: false },
    });
  }

  async assertPresetActive(presetId: string) {
    const preset = await this.prisma.notificationSoundPreset.findFirst({
      where: { id: presetId, isActive: true },
    });
    if (!preset) {
      throw new BadRequestException('Звуковой пресет не найден');
    }
    return preset;
  }
}
