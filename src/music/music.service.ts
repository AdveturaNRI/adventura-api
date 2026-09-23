import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AddPlaylistTrackDto,
  CreateMusicPlaylistDto,
  CreateMusicTrackFromUrlDto,
  ReorderPlaylistTracksDto,
  UpdateMusicPlaylistDto,
  UpdateMusicTrackDto,
} from './dto/music.dto';
import {
  MAX_MUSIC_EXTERNAL_TRACKS,
  MAX_MUSIC_LIBRARY_BYTES,
  MAX_MUSIC_TRACK_BYTES,
  MUSIC_SIGNED_URL_EXPIRES_SEC,
  MUSIC_TRACK_COLLECTION,
  MUSIC_TRACK_ENTITY,
} from './music.constants';
import {
  detectCloudShare,
  resolveCloudPlaybackUrl,
  titleHintFromCloudUrl,
} from './music-cloud-links';

export {
  MAX_MUSIC_EXTERNAL_TRACKS,
  MAX_MUSIC_LIBRARY_BYTES,
  MAX_MUSIC_TRACK_BYTES,
  MUSIC_SIGNED_URL_EXPIRES_SEC,
  MUSIC_TRACK_COLLECTION,
  MUSIC_TRACK_ENTITY,
} from './music.constants';

const ALLOWED_MUSIC_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/x-m4a',
  'audio/flac',
]);

const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/ogg',
};

export type MusicTrackSource = 'upload' | 'external';

export type MusicTrackDto = {
  id: string;
  title: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  source: MusicTrackSource;
  url: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MusicPlaylistSummaryDto = {
  id: string;
  title: string;
  sortOrder: number;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MusicPlaylistDetailDto = MusicPlaylistSummaryDto & {
  tracks: MusicTrackDto[];
};

export type MusicQuotaDto = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  trackCount: number;
};

@Injectable()
export class MusicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  assertAudioFile(file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Аудиофайл не передан');
    }
    if (file.size > MAX_MUSIC_TRACK_BYTES) {
      throw new BadRequestException(
        `Трек слишком большой (макс. ${formatMusicLimit()})`,
      );
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MUSIC_MIME.has(mime) && !mime.startsWith('audio/')) {
      throw new BadRequestException('Нужен аудиофайл (mp3/ogg/wav/m4a/flac)');
    }
  }

  async getQuota(userId: string): Promise<MusicQuotaDto> {
    const [agg, trackCount] = await Promise.all([
      this.prisma.musicTrack.aggregate({
        where: { userId, externalUrl: null },
        _sum: { sizeBytes: true },
      }),
      this.prisma.musicTrack.count({ where: { userId } }),
    ]);
    const usedBytes = agg._sum.sizeBytes ?? 0;
    return {
      usedBytes,
      limitBytes: MAX_MUSIC_LIBRARY_BYTES,
      remainingBytes: Math.max(0, MAX_MUSIC_LIBRARY_BYTES - usedBytes),
      trackCount,
    };
  }

  private async assertLibraryQuota(userId: string, incomingBytes: number) {
    const quota = await this.getQuota(userId);
    if (quota.usedBytes + incomingBytes > quota.limitBytes) {
      const free = formatBytesRu(quota.remainingBytes);
      throw new BadRequestException(
        `Лимит библиотеки 300 МБ. Свободно ${free} — удалите старые треки или выберите файл поменьше`,
      );
    }
  }

  async listTracks(userId: string): Promise<{
    tracks: MusicTrackDto[];
    quota: MusicQuotaDto;
  }> {
    const tracks = await this.prisma.musicTrack.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const [mapped, quota] = await Promise.all([
      Promise.all(tracks.map((track) => this.toTrackDto(track))),
      this.getQuota(userId),
    ]);
    return { tracks: mapped, quota };
  }

  async getTrack(userId: string, trackId: string): Promise<MusicTrackDto> {
    const track = await this.requireTrack(userId, trackId);
    return this.toTrackDto(track);
  }

  /** Свежие signed URL для очереди плеера (без полной карточки трека). */
  async refreshTrackUrls(
    userId: string,
    trackIds: string[],
  ): Promise<{ id: string; url: string | null }[]> {
    const uniqueIds = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const tracks = await this.prisma.musicTrack.findMany({
      where: { userId, id: { in: uniqueIds } },
      select: { id: true, externalUrl: true },
    });
    const byId = new Map(tracks.map((track) => [track.id, track]));

    const uploadedIds = tracks
      .filter((track) => !track.externalUrl)
      .map((track) => track.id);

    const mediaRows =
      uploadedIds.length === 0
        ? []
        : await this.prisma.media.findMany({
            where: {
              entityType: MUSIC_TRACK_ENTITY,
              entityId: { in: uploadedIds },
              collection: MUSIC_TRACK_COLLECTION,
            },
            orderBy: { variant: 'asc' },
          });

    const mediaByTrack = new Map<string, (typeof mediaRows)[number]>();
    for (const row of mediaRows) {
      if (!mediaByTrack.has(row.entityId)) {
        mediaByTrack.set(row.entityId, row);
      }
    }

    return Promise.all(
      uniqueIds.map(async (id) => {
        const track = byId.get(id);
        if (!track) {
          return { id, url: null };
        }
        if (track.externalUrl) {
          return {
            id,
            url: await this.resolveExternalPlayUrl(track.externalUrl),
          };
        }
        const file = mediaByTrack.get(id) ?? null;
        const url = file
          ? await this.mediaService.getPublicUrl(file, MUSIC_SIGNED_URL_EXPIRES_SEC)
          : null;
        return { id, url };
      }),
    );
  }

  async createTrackFromUrl(
    userId: string,
    dto: CreateMusicTrackFromUrlDto,
  ): Promise<MusicTrackDto> {
    const rawUrl = dto.url.trim();

    if (isBlockedMediaPlatform(rawUrl)) {
      throw new BadRequestException(
        'YouTube и похожие платформы не принимаем. Нужен Яндекс Диск или прямая ссылка на mp3/ogg/wav',
      );
    }

    if (isGoogleDriveUrl(rawUrl)) {
      throw new BadRequestException(
        'Google Диск больше не поддерживаем. Загрузите файл или дайте ссылку Яндекс Диска / прямой mp3',
      );
    }

    const cloudKind = detectCloudShare(rawUrl);
    if (cloudKind === 'yandex-disk') {
      // Без копии в S3: публичная ссылка, play — прямой href с Диска.
      await resolveCloudPlaybackUrl(rawUrl);

      const externalCount = await this.prisma.musicTrack.count({
        where: { userId, externalUrl: { not: null } },
      });
      if (externalCount >= MAX_MUSIC_EXTERNAL_TRACKS) {
        throw new BadRequestException(
          `Лимит ссылок: ${MAX_MUSIC_EXTERNAL_TRACKS}. Удалите старые или загрузите файл`,
        );
      }

      const titleHint = titleHintFromCloudUrl(rawUrl);
      const resolvedTitle =
        dto.title?.trim() || titleHint || 'Трек с Яндекс Диска';

      const track = await this.prisma.musicTrack.create({
        data: {
          userId,
          title: resolvedTitle.slice(0, 200),
          originalName: cloudKind,
          mimeType: 'audio/mpeg',
          sizeBytes: 0,
          externalUrl: rawUrl,
        },
      });

      return this.toTrackDto(track);
    }

    const externalUrl = normalizeExternalAudioUrl(rawUrl);
    const externalCount = await this.prisma.musicTrack.count({
      where: { userId, externalUrl: { not: null } },
    });
    if (externalCount >= MAX_MUSIC_EXTERNAL_TRACKS) {
      throw new BadRequestException(
        `Лимит ссылок: ${MAX_MUSIC_EXTERNAL_TRACKS}. Удалите старые или загрузите файл`,
      );
    }

    const fileName = fileNameFromUrl(externalUrl);
    const mimeType = mimeFromFileName(fileName) || 'audio/mpeg';
    const resolvedTitle =
      dto.title?.trim() ||
      stripExtension(fileName) ||
      'Трек по ссылке';

    const track = await this.prisma.musicTrack.create({
      data: {
        userId,
        title: resolvedTitle.slice(0, 200),
        originalName: fileName,
        mimeType,
        sizeBytes: 0,
        externalUrl,
      },
    });

    return this.toTrackDto(track);
  }

  async uploadTrack(
    userId: string,
    file: Express.Multer.File,
    title?: string,
  ): Promise<MusicTrackDto> {
    this.assertAudioFile(file);
    await this.assertLibraryQuota(userId, file.size);

    const originalName = sanitizeFileName(file.originalname);
    const resolvedTitle =
      title?.trim() ||
      stripExtension(originalName) ||
      'Без названия';

    const track = await this.prisma.musicTrack.create({
      data: {
        userId,
        title: resolvedTitle.slice(0, 200),
        originalName,
        mimeType: file.mimetype || 'audio/mpeg',
        sizeBytes: file.size,
      },
    });

    try {
      await this.mediaService.saveRawFile(
        {
          entityType: MUSIC_TRACK_ENTITY,
          entityId: track.id,
          collection: MUSIC_TRACK_COLLECTION,
        },
        file.buffer,
        file.mimetype || 'audio/mpeg',
        { fileName: originalName || 'track.mp3', variant: 'file' },
      );
    } catch (error) {
      await this.prisma.musicTrack.delete({ where: { id: track.id } });
      throw error;
    }

    return this.toTrackDto(track);
  }

  async updateTrack(
    userId: string,
    trackId: string,
    dto: UpdateMusicTrackDto,
  ): Promise<MusicTrackDto> {
    const track = await this.requireTrack(userId, trackId);
    const updated = await this.prisma.musicTrack.update({
      where: { id: track.id },
      data: { title: dto.title.trim().slice(0, 200) },
    });
    return this.toTrackDto(updated);
  }

  async deleteTrack(userId: string, trackId: string): Promise<{ ok: true }> {
    const track = await this.requireTrack(userId, trackId);
    if (!track.externalUrl) {
      await this.mediaService.deleteEntityMedia(MUSIC_TRACK_ENTITY, track.id);
    }
    await this.prisma.musicTrack.delete({ where: { id: track.id } });
    return { ok: true };
  }

  async listPlaylists(userId: string): Promise<MusicPlaylistSummaryDto[]> {
    const playlists = await this.prisma.musicPlaylist.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: true } } },
    });

    return playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      sortOrder: playlist.sortOrder,
      trackCount: playlist._count.items,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    }));
  }

  async createPlaylist(
    userId: string,
    dto: CreateMusicPlaylistDto,
  ): Promise<MusicPlaylistDetailDto> {
    const maxSort = await this.prisma.musicPlaylist.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });

    const playlist = await this.prisma.musicPlaylist.create({
      data: {
        userId,
        title: dto.title.trim().slice(0, 120),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    return this.getPlaylist(userId, playlist.id);
  }

  async getPlaylist(
    userId: string,
    playlistId: string,
  ): Promise<MusicPlaylistDetailDto> {
    const playlist = await this.requirePlaylist(userId, playlistId);
    const items = await this.prisma.musicPlaylistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { sortOrder: 'asc' },
      include: { track: true },
    });

    const tracks = await Promise.all(
      items.map((item) => this.toTrackDto(item.track)),
    );

    return {
      id: playlist.id,
      title: playlist.title,
      sortOrder: playlist.sortOrder,
      trackCount: tracks.length,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
      tracks,
    };
  }

  async updatePlaylist(
    userId: string,
    playlistId: string,
    dto: UpdateMusicPlaylistDto,
  ): Promise<MusicPlaylistDetailDto> {
    const playlist = await this.requirePlaylist(userId, playlistId);
    if (dto.title !== undefined) {
      await this.prisma.musicPlaylist.update({
        where: { id: playlist.id },
        data: { title: dto.title.trim().slice(0, 120) },
      });
    }
    return this.getPlaylist(userId, playlist.id);
  }

  async deletePlaylist(
    userId: string,
    playlistId: string,
  ): Promise<{ ok: true }> {
    const playlist = await this.requirePlaylist(userId, playlistId);
    await this.prisma.musicPlaylist.delete({ where: { id: playlist.id } });
    return { ok: true };
  }

  async addTrackToPlaylist(
    userId: string,
    playlistId: string,
    dto: AddPlaylistTrackDto,
  ): Promise<MusicPlaylistDetailDto> {
    const playlist = await this.requirePlaylist(userId, playlistId);
    const track = await this.requireTrack(userId, dto.trackId);

    const existing = await this.prisma.musicPlaylistItem.findUnique({
      where: {
        playlistId_trackId: {
          playlistId: playlist.id,
          trackId: track.id,
        },
      },
    });
    if (existing) {
      return this.getPlaylist(userId, playlist.id);
    }

    const maxSort = await this.prisma.musicPlaylistItem.aggregate({
      where: { playlistId: playlist.id },
      _max: { sortOrder: true },
    });

    await this.prisma.musicPlaylistItem.create({
      data: {
        playlistId: playlist.id,
        trackId: track.id,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    return this.getPlaylist(userId, playlist.id);
  }

  async removeTrackFromPlaylist(
    userId: string,
    playlistId: string,
    trackId: string,
  ): Promise<MusicPlaylistDetailDto> {
    await this.requirePlaylist(userId, playlistId);
    await this.prisma.musicPlaylistItem.deleteMany({
      where: { playlistId, trackId },
    });
    return this.getPlaylist(userId, playlistId);
  }

  async reorderPlaylistTracks(
    userId: string,
    playlistId: string,
    dto: ReorderPlaylistTracksDto,
  ): Promise<MusicPlaylistDetailDto> {
    const playlist = await this.requirePlaylist(userId, playlistId);
    const uniqueIds = [...new Set(dto.trackIds)];

    const owned = await this.prisma.musicTrack.findMany({
      where: { userId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (owned.length !== uniqueIds.length) {
      throw new BadRequestException('В списке есть чужой или удалённый трек');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.musicPlaylistItem.deleteMany({
        where: { playlistId: playlist.id },
      });
      if (uniqueIds.length === 0) {
        return;
      }
      await tx.musicPlaylistItem.createMany({
        data: uniqueIds.map((trackId, index) => ({
          playlistId: playlist.id,
          trackId,
          sortOrder: index,
        })),
      });
    });

    return this.getPlaylist(userId, playlist.id);
  }

  private async requireTrack(userId: string, trackId: string) {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
    });
    if (!track) {
      throw new NotFoundException('Трек не найден');
    }
    if (track.userId !== userId) {
      throw new ForbiddenException('Это не ваш трек');
    }
    return track;
  }

  private async requirePlaylist(userId: string, playlistId: string) {
    const playlist = await this.prisma.musicPlaylist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      throw new NotFoundException('Плейлист не найден');
    }
    if (playlist.userId !== userId) {
      throw new ForbiddenException('Это не ваш плейлист');
    }
    return playlist;
  }

  private async toTrackDto(track: {
    id: string;
    userId: string;
    title: string;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number;
    durationSec: number | null;
    externalUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<MusicTrackDto> {
    if (track.externalUrl) {
      return {
        id: track.id,
        title: track.title,
        originalName: track.originalName,
        mimeType: track.mimeType,
        sizeBytes: track.sizeBytes,
        durationSec: track.durationSec,
        source: 'external',
        url: await this.resolveExternalPlayUrl(track.externalUrl),
        createdAt: track.createdAt.toISOString(),
        updatedAt: track.updatedAt.toISOString(),
      };
    }

    const media = await this.mediaService.getCollection({
      entityType: MUSIC_TRACK_ENTITY,
      entityId: track.id,
      collection: MUSIC_TRACK_COLLECTION,
    });
    const file = media[0] ?? null;
    const url = file
      ? await this.mediaService.getPublicUrl(file, MUSIC_SIGNED_URL_EXPIRES_SEC)
      : null;

    return {
      id: track.id,
      title: track.title,
      originalName: track.originalName,
      mimeType: track.mimeType,
      sizeBytes: track.sizeBytes,
      durationSec: track.durationSec ?? file?.durationSec ?? null,
      source: 'upload',
      url,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
    };
  }

  /** Яндекс Диск — временная href; прямые ссылки — как есть. Без серверного прокси. */
  private async resolveExternalPlayUrl(
    externalUrl: string,
  ): Promise<string | null> {
    if (detectCloudShare(externalUrl) === 'yandex-disk') {
      try {
        const resolved = await resolveCloudPlaybackUrl(externalUrl);
        return resolved.playbackUrl;
      } catch {
        return null;
      }
    }
    if (isGoogleDriveUrl(externalUrl) || isBlockedMediaPlatform(externalUrl)) {
      return null;
    }
    return externalUrl;
  }
}

function formatMusicLimit(): string {
  const mb = MAX_MUSIC_TRACK_BYTES / (1024 * 1024);
  const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
  return `${label} МБ`;
}

function formatBytesRu(size: number) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.floor(size / 1024)} КБ`;
  const mb = size / (1024 * 1024);
  const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
  return `${label} МБ`;
}

function sanitizeFileName(name?: string | null): string | null {
  if (!name?.trim()) return null;
  return name.trim().slice(0, 200);
}

function stripExtension(name: string | null): string | null {
  if (!name) return null;
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base || null;
}

function normalizeExternalAudioUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Некорректная ссылка');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Нужна ссылка http(s)');
  }

  if (!parsed.hostname || parsed.hostname === 'localhost' || isPrivateHostname(parsed.hostname)) {
    throw new BadRequestException('Ссылка на локальный/внутренний адрес не подходит');
  }

  const pathname = decodeURIComponent(parsed.pathname || '');
  const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
  if (ext && !AUDIO_EXT_MIME[ext] && !pathname.toLowerCase().includes('audio')) {
    // Разрешаем и без расширения (CDN), но режем явный мусор вроде .html/.exe
    const blocked = new Set([
      'html',
      'htm',
      'php',
      'asp',
      'aspx',
      'exe',
      'js',
      'css',
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'svg',
      'pdf',
      'zip',
    ]);
    if (blocked.has(ext)) {
      throw new BadRequestException(
        'Нужна прямая ссылка на аудиофайл (mp3/ogg/wav/m4a…), не на страницу',
      );
    }
  }

  return parsed.toString();
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  return false;
}

function hostFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isGoogleDriveUrl(rawUrl: string): boolean {
  const host = hostFromUrl(rawUrl);
  if (!host) return false;
  return (
    host === 'drive.google.com' ||
    host === 'docs.google.com' ||
    host === 'drive.usercontent.google.com'
  );
}

function isBlockedMediaPlatform(rawUrl: string): boolean {
  const host = hostFromUrl(rawUrl);
  if (!host) return false;
  const blocked = [
    'youtube.com',
    'youtu.be',
    'music.youtube.com',
    'm.youtube.com',
    'soundcloud.com',
    'on.soundcloud.com',
    'vimeo.com',
    'player.vimeo.com',
    'tiktok.com',
    'vm.tiktok.com',
    'rutube.ru',
    'vk.com',
    'vkvideo.ru',
  ];
  return blocked.some((item) => host === item || host.endsWith(`.${item}`));
}

function fileNameFromUrl(url: string): string | null {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const base = path.split('/').filter(Boolean).pop() ?? null;
    if (!base || base.length > 200) return null;
    return base;
  } catch {
    return null;
  }
}

function mimeFromFileName(name: string | null): string | null {
  if (!name) return null;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXT_MIME[ext] ?? null;
}
