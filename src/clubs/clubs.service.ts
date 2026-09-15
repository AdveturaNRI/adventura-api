import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClubMemberRole, Prisma } from '@prisma/client';

import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubLinkDto, CreateClubDto, ClubScheduleDayDto } from './dto/create-club.dto';
import { DeleteClubDto } from './dto/delete-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import type { ClubLink, ClubListItem, ClubScheduleDay, GeocodeResult } from './types/club.type';

const CLUB_ENTITY_TYPE = 'Club';
const COVER_COLLECTION = 'cover';
const GALLERY_PREFIX = 'gallery-';
const MAX_GALLERY = 8;
const DADATA_SUGGEST_URL =
  'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DADATA_CLEAN_URL = 'https://cleaner.dadata.ru/api/v1/clean/address';

const CLUB_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  address: true,
  lat: true,
  lng: true,
  cityId: true,
  tags: true,
  links: true,
  schedule: true,
  isPublished: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  city: {
    select: { id: true, name: true, region: true },
  },
} satisfies Prisma.ClubSelect;

type ClubRow = Prisma.ClubGetPayload<{ select: typeof CLUB_SELECT }>;

type DadataSuggestItem = {
  value?: string;
  unrestricted_value?: string;
  data?: {
    geo_lat?: string | null;
    geo_lon?: string | null;
    city?: string | null;
    city_with_type?: string | null;
    settlement?: string | null;
    settlement_with_type?: string | null;
    region?: string | null;
    region_with_type?: string | null;
    street?: string | null;
    street_with_type?: string | null;
    house?: string | null;
    block?: string | null;
    fias_level?: string | number | null;
    qc_geo?: string | number | null;
  };
};

@Injectable()
export class ClubsService {
  private readonly logger = new Logger(ClubsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async listMap(viewerId: string): Promise<ClubListItem[]> {
    const clubs = await this.prisma.club.findMany({
      where: {
        deletedAt: null,
        OR: [
          { isPublished: true },
          { ownerId: viewerId },
          {
            members: {
              some: {
                userId: viewerId,
                role: { in: [ClubMemberRole.OWNER, ClubMemberRole.ADMIN] },
              },
            },
          },
        ],
      },
      select: CLUB_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const manageableClubIds = await this.findManageableClubIds(
      viewerId,
      clubs.map((club) => club.id),
    );
    return Promise.all(
      clubs.map((club) =>
        this.toListItem(club, viewerId, manageableClubIds.has(club.id)),
      ),
    );
  }

  async listMine(ownerId: string): Promise<ClubListItem[]> {
    const clubs = await this.prisma.club.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId },
          {
            members: {
              some: {
                userId: ownerId,
                role: { in: [ClubMemberRole.OWNER, ClubMemberRole.ADMIN] },
              },
            },
          },
        ],
      },
      select: CLUB_SELECT,
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(clubs.map((club) => this.toListItem(club, ownerId, true)));
  }

  async getOne(viewerId: string, clubId: string): Promise<ClubListItem> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: CLUB_SELECT,
    });

    if (!club || club.deletedAt) {
      throw new NotFoundException('Клуб не найден');
    }

    const canManage = await this.canManage(viewerId, club);
    if (!club.isPublished && !canManage) {
      throw new NotFoundException('Клуб не найден');
    }

    return this.toListItem(club, viewerId, canManage);
  }

  async create(ownerId: string, dto: CreateClubDto): Promise<ClubListItem> {
    const schedule = this.normalizeSchedule(dto.schedule);
    await this.assertCity(dto.cityId);

    const created = await this.prisma.$transaction(async (tx) => {
      const club = await tx.club.create({
        data: {
          ownerId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          address: dto.address.trim(),
          lat: dto.lat,
          lng: dto.lng,
          cityId: dto.cityId || null,
          tags: this.normalizeTags(dto.tags),
          links: this.normalizeLinks(dto.links),
          schedule,
          isPublished: dto.isPublished ?? true,
        },
        select: CLUB_SELECT,
      });
      await tx.clubMember.create({
        data: { clubId: club.id, userId: ownerId, role: ClubMemberRole.OWNER },
      });
      return club;
    });

    return this.toListItem(created, ownerId, true);
  }

  async update(ownerId: string, clubId: string, dto: UpdateClubDto): Promise<ClubListItem> {
    await this.requireManageAccess(ownerId, clubId);
    const schedule = this.normalizeSchedule(dto.schedule);
    await this.assertCity(dto.cityId);

    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        address: dto.address.trim(),
        lat: dto.lat,
        lng: dto.lng,
        cityId: dto.cityId || null,
        tags: this.normalizeTags(dto.tags),
        links: this.normalizeLinks(dto.links),
        schedule,
        isPublished: dto.isPublished ?? true,
      },
      select: CLUB_SELECT,
    });

    return this.toListItem(updated, ownerId, true);
  }

  async remove(
    actorId: string,
    clubId: string,
    dto: DeleteClubDto,
  ): Promise<{ ok: true }> {
    const club = await this.requireManageAccess(actorId, clubId);
    if (dto.confirmationName.trim() !== club.name) {
      throw new BadRequestException('Введите точное название клуба для подтверждения');
    }

    const memberIds = await this.prisma.$transaction(async (tx) => {
      const members = await tx.clubMember.findMany({
        where: { clubId },
        select: { userId: true },
      });
      await tx.club.update({
        where: { id: clubId },
        data: { isPublished: false, deletedAt: new Date() },
      });
      return members.map((member) => member.userId);
    });

    await this.notificationsService.notifyClubDeleted(actorId, memberIds, {
      id: club.id,
      name: club.name,
    });
    return { ok: true };
  }

  async uploadCover(ownerId: string, clubId: string, file?: Express.Multer.File) {
    await this.requireManageAccess(ownerId, clubId);
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }

    const variants = await this.imageProcessor.processImage(
      file.buffer,
      file.mimetype,
      ['cardThumb', 'card', 'original'],
    );

    await this.mediaService.replaceCollection(
      {
        entityType: CLUB_ENTITY_TYPE,
        entityId: clubId,
        collection: COVER_COLLECTION,
      },
      variants,
    );

    return this.getManaged(ownerId, clubId);
  }

  async deleteCover(ownerId: string, clubId: string) {
    await this.requireManageAccess(ownerId, clubId);
    await this.mediaService.deleteCollection({
      entityType: CLUB_ENTITY_TYPE,
      entityId: clubId,
      collection: COVER_COLLECTION,
    });
    return this.getManaged(ownerId, clubId);
  }

  async uploadGallery(ownerId: string, clubId: string, files: Express.Multer.File[]) {
    await this.requireManageAccess(ownerId, clubId);

    if (!files?.length) {
      throw new BadRequestException('Файлы не переданы');
    }

    if (files.length > MAX_GALLERY) {
      throw new BadRequestException(`Максимум ${MAX_GALLERY} фото в галерее`);
    }

    await this.deleteGallery(clubId);

    for (let index = 0; index < files.length; index += 1) {
      await this.storeGalleryFile(clubId, index, files[index]);
    }

    return this.getManaged(ownerId, clubId);
  }

  async addGalleryItems(ownerId: string, clubId: string, files: Express.Multer.File[]) {
    await this.requireManageAccess(ownerId, clubId);

    if (!files?.length) {
      throw new BadRequestException('Файлы не переданы');
    }

    const existingIndices = await this.getGalleryIndices(clubId);
    if (existingIndices.length + files.length > MAX_GALLERY) {
      throw new BadRequestException(`Максимум ${MAX_GALLERY} фото в галерее`);
    }

    const start = existingIndices.length;
    for (let offset = 0; offset < files.length; offset += 1) {
      await this.storeGalleryFile(clubId, start + offset, files[offset]);
    }

    return this.getManaged(ownerId, clubId);
  }

  async deleteGalleryItem(ownerId: string, clubId: string, index: number) {
    await this.requireManageAccess(ownerId, clubId);
    const existingIndices = await this.getGalleryIndices(clubId);
    if (!existingIndices.includes(index)) {
      throw new NotFoundException('Фото в галерее не найдено');
    }

    await this.mediaService.deleteCollection({
      entityType: CLUB_ENTITY_TYPE,
      entityId: clubId,
      collection: `${GALLERY_PREFIX}${index}`,
    });
    await this.reorderGalleryCollections(
      clubId,
      existingIndices.filter((item) => item !== index),
    );
    return this.getManaged(ownerId, clubId);
  }

  async reorderGallery(ownerId: string, clubId: string, order: number[]) {
    await this.requireManageAccess(ownerId, clubId);
    const existingIndices = await this.getGalleryIndices(clubId);
    const requested = [...new Set(order)];
    const isSameSet =
      order.length === existingIndices.length &&
      requested.length === existingIndices.length &&
      requested.every((index) => existingIndices.includes(index));

    if (!isSameSet) {
      throw new BadRequestException('Передан неполный или некорректный порядок галереи');
    }

    await this.reorderGalleryCollections(clubId, order);
    return this.getManaged(ownerId, clubId);
  }

  async geocode(query: string, countrycodes = 'ru'): Promise<GeocodeResult> {
    const q = query.trim();
    if (!q) {
      throw new NotFoundException('Адрес не найден — уточните или выберите точку на карте');
    }

    const dadataKey = this.config.get<string>('DADATA_API_KEY')?.trim();
    const dadataSecret = this.config.get<string>('DADATA_SECRET_KEY')?.trim();

    if (dadataKey && dadataSecret) {
      try {
        const cleaned = await this.cleanDadata(q, dadataKey, dadataSecret);
        if (cleaned) {
          return cleaned;
        }
      } catch (error) {
        this.logger.warn(
          `DaData clean failed, fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (dadataKey) {
      try {
        const hits = await this.suggestDadata(q, undefined, dadataKey, 'city');
        const hit = hits[0];
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
          return hit;
        }
      } catch (error) {
        this.logger.warn(
          `DaData suggest geocode failed, fallback to Nominatim: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const hits = await this.searchNominatim(q, countrycodes, 1);
    const hit = hits[0];
    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) {
      throw new NotFoundException('Адрес не найден — уточните или выберите точку на карте');
    }
    return hit;
  }

  private async cleanDadata(
    query: string,
    apiKey: string,
    secretKey: string,
  ): Promise<GeocodeResult | null> {
    const response = await fetch(DADATA_CLEAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${apiKey}`,
        'X-Secret': secretKey,
      },
      body: JSON.stringify([query]),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as Array<{
      geo_lat?: string | null;
      geo_lon?: string | null;
      city?: string | null;
      city_with_type?: string | null;
      settlement?: string | null;
      settlement_with_type?: string | null;
      region_with_type?: string | null;
      region?: string | null;
      result?: string | null;
      qc_geo?: number | string | null;
    }>;

    const row = payload[0];
    if (!row) {
      return null;
    }

    const lat = Number(row.geo_lat);
    const lng = Number(row.geo_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    // qc_geo: 0–4 ок, 5 — координаты не определены
    const qc = Number(row.qc_geo);
    if (Number.isFinite(qc) && qc >= 5) {
      return null;
    }

    const city =
      row.city_with_type ||
      row.city ||
      row.settlement_with_type ||
      row.settlement ||
      row.result ||
      query;
    const region = row.region_with_type || row.region;
    const shortName =
      region && city && !String(city).includes(String(region).replace(/^.*? /, ''))
        ? `${city}, ${region}`
        : String(city);

    return {
      lat,
      lng,
      displayName: row.result?.trim() || shortName,
      shortName,
    };
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ru');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AdventuraClubs/1.0 (contact: support@adventura.app)',
      },
    });

    if (!response.ok) {
      throw new BadRequestException('Не удалось определить город по координатам');
    }

    const data = (await response.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: Record<string, string>;
      error?: string;
    };

    if (data.error || !data.address) {
      throw new NotFoundException('Город по координатам не найден');
    }

    const city =
      data.address.city ||
      data.address.town ||
      data.address.village ||
      data.address.municipality ||
      data.address.county ||
      data.address.state;

    if (!city) {
      throw new NotFoundException('Город по координатам не найден');
    }

    const region = data.address.state;
    const shortName =
      region && region !== city && !city.includes(region) ? `${city}, ${region}` : city;

    return {
      lat: Number(data.lat ?? lat),
      lng: Number(data.lon ?? lng),
      displayName: data.display_name || shortName,
      shortName,
    };
  }

  async suggestGeocode(
    query: string,
    city?: string,
    countrycodes = 'ru',
    kind: 'address' | 'city' = 'address',
  ): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }

    const dadataKey = this.config.get<string>('DADATA_API_KEY')?.trim();
    if (dadataKey) {
      try {
        const hits = await this.suggestDadata(q, city, dadataKey, kind);
        if (hits.length) {
          return hits;
        }
      } catch (error) {
        this.logger.warn(
          `DaData suggest failed, fallback to Nominatim: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (kind === 'city') {
      return this.searchNominatim(`${q}, Россия`, countrycodes, 8, 'city');
    }

    const cityPart = city?.trim();
    const composed =
      cityPart && !q.toLowerCase().includes(cityPart.toLowerCase().split(',')[0]!.trim())
        ? `${q}, ${cityPart}`
        : q;

    return this.searchNominatim(composed, countrycodes, 8, 'address');
  }

  private async suggestDadata(
    query: string,
    city: string | undefined,
    apiKey: string,
    kind: 'address' | 'city' = 'address',
  ): Promise<GeocodeResult[]> {
    const cityName = city?.split(',')[0]?.trim();
    const body: Record<string, unknown> = {
      query,
      count: 8,
      language: 'ru',
    };

    if (kind === 'city') {
      // Только города / НП, без улиц и домов
      body.from_bound = { value: 'city' };
      body.to_bound = { value: 'settlement' };
      body.locations = [{ country_iso_code: 'RU' }];
    } else if (cityName) {
      body.locations = [{ city: cityName }, { settlement: cityName }];
      body.locations_boost = [{ city: cityName }];
    }

    const response = await fetch(DADATA_SUGGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { suggestions?: DadataSuggestItem[] };
    let suggestions = payload.suggestions ?? [];

    if (!suggestions.length && cityName) {
      const retry = await fetch(DADATA_SUGGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({ query, count: 8, language: 'ru' }),
      });
      if (retry.ok) {
        const retryPayload = (await retry.json()) as { suggestions?: DadataSuggestItem[] };
        suggestions = retryPayload.suggestions ?? [];
      }
    }

    const mapped = suggestions
      .filter((item) =>
        kind === 'city' ? this.isDadataCitySuggestion(item, query) : true,
      )
      .map((item) => this.mapDadataSuggestion(item, kind))
      .filter((item): item is GeocodeResult => item != null);

    return mapped;
  }

  private normalizePlaceName(value: string): string {
    return value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/^(г\.?|город|пгт\.?|пос[её]лок|село|деревня)\s+/i, '')
      .trim();
  }

  private isDadataCitySuggestion(item: DadataSuggestItem, query?: string): boolean {
    const data = item.data;
    if (!data) {
      return false;
    }
    // Улица/дом — это адрес, не город
    if (data.street || data.street_with_type || data.house || data.block) {
      return false;
    }

    const fiasLevel = Number(data.fias_level);
    // 7+ — улица/дом и ниже
    if (Number.isFinite(fiasLevel) && fiasLevel >= 7) {
      return false;
    }

    const placeRaw =
      data.city || data.settlement || data.city_with_type || data.settlement_with_type;
    if (!placeRaw) {
      return false;
    }

    if (query?.trim()) {
      const needle = this.normalizePlaceName(query.split(',')[0] ?? query);
      const place = this.normalizePlaceName(placeRaw);
      if (!place.includes(needle) && !needle.includes(place)) {
        return false;
      }
    }

    return true;
  }

  private mapDadataSuggestion(
    item: DadataSuggestItem,
    kind: 'address' | 'city' = 'address',
  ): GeocodeResult | null {
    const lat = Number(item.data?.geo_lat);
    const lng = Number(item.data?.geo_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const value = item.value?.trim() || '';
    const full = item.unrestricted_value?.trim() || value;

    if (kind === 'city') {
      const city =
        item.data?.city_with_type ||
        item.data?.city ||
        item.data?.settlement_with_type ||
        item.data?.settlement ||
        value;
      const region = item.data?.region_with_type || item.data?.region;
      const shortName =
        region && city && !city.includes(region.replace(/^.*? /, ''))
          ? `${city}, ${region}`
          : city || value || full;

      return {
        lat,
        lng,
        // Не светим unrestricted_value с улицами/POI
        displayName: shortName,
        shortName,
      };
    }

    const street = item.data?.street_with_type;
    const houseParts = [item.data?.house, item.data?.block].filter(Boolean).join(' ');
    const localShort =
      street && houseParts
        ? `${street}, д ${houseParts}`
        : street || null;

    return {
      lat,
      lng,
      displayName: full || value,
      shortName: localShort || value || full,
    };
  }

  private async searchNominatim(
    query: string,
    countrycodes: string,
    limit: number,
    kind: 'address' | 'city' = 'address',
  ): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 1) {
      return [];
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('countrycodes', countrycodes);
    if (kind === 'city') {
      url.searchParams.set('featuretype', 'city');
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AdventuraClubs/1.0 (contact: support@adventura.app)',
      },
    });

    if (!response.ok) {
      throw new BadRequestException('Не удалось геокодировать адрес');
    }

    const data = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      class?: string;
      type?: string;
      address?: Record<string, string>;
    }>;

    const hits =
      kind === 'city'
        ? data.filter((hit) => {
            const place =
              hit.address?.city ||
              hit.address?.town ||
              hit.address?.village ||
              hit.address?.municipality;
            const isPlace =
              hit.class === 'place' ||
              ['city', 'town', 'village', 'hamlet', 'municipality'].includes(hit.type ?? '');
            return Boolean(place) || isPlace;
          })
        : data;

    return hits
      .map((hit) => {
        if (kind === 'city') {
          const city =
            hit.address?.city ||
            hit.address?.town ||
            hit.address?.village ||
            hit.address?.municipality ||
            hit.display_name.split(',')[0]?.trim() ||
            hit.display_name;
          const region = hit.address?.state;
          const shortName =
            region && city && !city.includes(region) ? `${city}, ${region}` : city;
          return {
            lat: Number(hit.lat),
            lng: Number(hit.lon),
            displayName: hit.display_name,
            shortName,
          };
        }

        return {
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          displayName: hit.display_name,
          shortName: this.formatShortAddress(hit.address) ?? hit.display_name,
        };
      })
      .filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng));
  }

  private formatShortAddress(address?: Record<string, string>): string | null {
    if (!address) {
      return null;
    }

    const road =
      address.road ||
      address.pedestrian ||
      address.residential ||
      address.street ||
      address.highway;
    const house = address.house_number;
    const suburb = address.suburb || address.neighbourhood || address.city_district;
    const city =
      address.city || address.town || address.village || address.municipality || address.county;

    const line = [road, house].filter(Boolean).join(', ');
    if (line) {
      const place = [suburb, city].filter(Boolean).join(', ');
      return place ? `${line} — ${place}` : line;
    }

    return null;
  }

  private async getManaged(userId: string, clubId: string) {
    const club = await this.requireManageAccess(userId, clubId);
    return this.toListItem(club, userId, true);
  }

  private async requireManageAccess(userId: string, clubId: string): Promise<ClubRow> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: CLUB_SELECT,
    });

    if (!club || club.deletedAt) {
      throw new NotFoundException('Клуб не найден');
    }

    if (!(await this.canManage(userId, club))) {
      throw new ForbiddenException('Это не ваш клуб');
    }

    return club;
  }

  private async assertCity(cityId?: string | null) {
    if (!cityId) {
      return;
    }

    const city = await this.prisma.city.findFirst({
      where: { id: cityId, isActive: true },
      select: { id: true },
    });

    if (!city) {
      throw new BadRequestException('Город не найден');
    }
  }

  private normalizeSchedule(days: ClubScheduleDayDto[]): ClubScheduleDay[] {
    if (days.length !== 7) {
      throw new BadRequestException('Нужно расписание на 7 дней');
    }

    const byDay = new Map(days.map((d) => [d.day, d]));
    const normalized: ClubScheduleDay[] = [];

    for (let day = 1; day <= 7; day += 1) {
      const item = byDay.get(day);
      if (!item) {
        throw new BadRequestException(`Нет дня ${day} в расписании`);
      }

      if (item.closed) {
        normalized.push({ day, closed: true, open: null, close: null });
        continue;
      }

      if (!item.open || !item.close) {
        throw new BadRequestException(`Укажите часы для дня ${day}`);
      }

      normalized.push({
        day,
        closed: false,
        open: item.open,
        close: item.close,
      });
    }

    return normalized;
  }

  private normalizeTags(tags?: string[]): string[] {
    const unique = new Map<string, string>();
    for (const raw of tags ?? []) {
      const value = raw.trim();
      if (value) {
        unique.set(value.toLocaleLowerCase('ru-RU'), value);
      }
    }
    return [...unique.values()];
  }

  private normalizeLinks(links?: ClubLinkDto[]): ClubLink[] {
    return (links ?? [])
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url);
  }

  private parseLinks(value: Prisma.JsonValue | null): ClubLink[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is Prisma.JsonObject =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
      .map((item) => ({
        label: String(item.label ?? '').trim(),
        url: String(item.url ?? '').trim(),
      }))
      .filter((item) => item.label && item.url);
  }

  private async canManage(userId: string, club: ClubRow): Promise<boolean> {
    if (club.ownerId === userId) {
      return true;
    }
    const membership = await this.prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId: club.id, userId } },
      select: { role: true },
    });
    return membership?.role === ClubMemberRole.OWNER || membership?.role === ClubMemberRole.ADMIN;
  }

  private async findManageableClubIds(userId: string, clubIds: string[]): Promise<Set<string>> {
    if (clubIds.length === 0) {
      return new Set();
    }
    const memberships = await this.prisma.clubMember.findMany({
      where: {
        userId,
        clubId: { in: clubIds },
        role: { in: [ClubMemberRole.OWNER, ClubMemberRole.ADMIN] },
      },
      select: { clubId: true },
    });
    return new Set(memberships.map((membership) => membership.clubId));
  }

  private parseSchedule(value: Prisma.JsonValue): ClubScheduleDay[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((raw) => {
      const item = raw as ClubScheduleDay;
      return {
        day: Number(item.day),
        closed: Boolean(item.closed),
        open: item.open ?? null,
        close: item.close ?? null,
      };
    });
  }

  private async storeGalleryFile(
    clubId: string,
    index: number,
    file: Express.Multer.File,
  ) {
    const variants = await this.imageProcessor.processImage(
      file.buffer,
      file.mimetype,
      ['cardThumb', 'card', 'original'],
    );

    await this.mediaService.replaceCollection(
      {
        entityType: CLUB_ENTITY_TYPE,
        entityId: clubId,
        collection: `${GALLERY_PREFIX}${index}`,
      },
      variants,
    );
  }

  private async deleteGallery(clubId: string) {
    for (let index = 0; index < MAX_GALLERY; index += 1) {
      await this.mediaService.deleteCollection({
        entityType: CLUB_ENTITY_TYPE,
        entityId: clubId,
        collection: `${GALLERY_PREFIX}${index}`,
      });
    }
  }

  private async getGalleryIndices(clubId: string): Promise<number[]> {
    const indices: number[] = [];
    for (let index = 0; index < MAX_GALLERY; index += 1) {
      const media = await this.mediaService.getCollection({
        entityType: CLUB_ENTITY_TYPE,
        entityId: clubId,
        collection: `${GALLERY_PREFIX}${index}`,
      });
      if (media.length > 0) indices.push(index);
    }
    return indices;
  }

  /**
   * Меняем только коллекции в БД: S3-ключи остаются неизменными, поэтому не
   * требуется копировать тяжёлые файлы. Временные имена исключают конфликт
   * уникального ключа (entityType, entityId, collection, variant) при обмене.
   */
  private async reorderGalleryCollections(clubId: string, order: number[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const oldIndex of order) {
        await tx.media.updateMany({
          where: {
            entityType: CLUB_ENTITY_TYPE,
            entityId: clubId,
            collection: `${GALLERY_PREFIX}${oldIndex}`,
          },
          data: { collection: `gallery-staging-${oldIndex}` },
        });
      }
      for (let nextIndex = 0; nextIndex < order.length; nextIndex += 1) {
        await tx.media.updateMany({
          where: {
            entityType: CLUB_ENTITY_TYPE,
            entityId: clubId,
            collection: `gallery-staging-${order[nextIndex]}`,
          },
          data: { collection: `${GALLERY_PREFIX}${nextIndex}` },
        });
      }
    });
  }

  private async toListItem(
    club: ClubRow,
    viewerId: string,
    canManage = club.ownerId === viewerId,
  ): Promise<ClubListItem> {
    const coverMedia = await this.mediaService.getCollection({
      entityType: CLUB_ENTITY_TYPE,
      entityId: club.id,
      collection: COVER_COLLECTION,
    });
    const coverUrls = await this.mediaService.getCollectionUrls(coverMedia);

    const galleryUrls: string[] = [];
    for (let index = 0; index < MAX_GALLERY; index += 1) {
      const media = await this.mediaService.getCollection({
        entityType: CLUB_ENTITY_TYPE,
        entityId: club.id,
        collection: `${GALLERY_PREFIX}${index}`,
      });
      if (!media.length) {
        break;
      }
      const urls = await this.mediaService.getCollectionUrls(media);
      galleryUrls.push(urls.card || urls.original || urls.cardThumb || '');
    }

    return {
      id: club.id,
      name: club.name,
      description: club.description,
      address: club.address,
      lat: club.lat,
      lng: club.lng,
      city: club.city,
      tags: club.tags,
      links: this.parseLinks(club.links),
      schedule: this.parseSchedule(club.schedule),
      isPublished: club.isPublished,
      coverUrl: coverUrls.card || coverUrls.original || coverUrls.cardThumb || null,
      galleryUrls: galleryUrls.filter(Boolean),
      isOwner: club.ownerId === viewerId,
      canManage,
      createdAt: club.createdAt.toISOString(),
      updatedAt: club.updatedAt.toISOString(),
    };
  }
}
