import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  APP_SETTING_KEYS,
  DEFAULT_YANDEX_METRIKA_SETTINGS,
  type YandexMetrikaAdminSettings,
  type YandexMetrikaPublicConfig,
} from './app-settings.constants';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') {
    return fallback;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function normalizeCounterId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('ID счётчика Метрики должен состоять только из цифр');
  }
  return trimmed;
}

@Injectable()
export class AppSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getYandexMetrikaAdmin(): Promise<YandexMetrikaAdminSettings> {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        key: {
          in: Object.values(APP_SETTING_KEYS),
        },
      },
    });
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
      counterId: map.get(APP_SETTING_KEYS.YANDEX_METRIKA_COUNTER_ID) ?? '',
      webvisor: parseBool(
        map.get(APP_SETTING_KEYS.YANDEX_METRIKA_WEBVISOR),
        DEFAULT_YANDEX_METRIKA_SETTINGS.webvisor,
      ),
      clickmap: parseBool(
        map.get(APP_SETTING_KEYS.YANDEX_METRIKA_CLICKMAP),
        DEFAULT_YANDEX_METRIKA_SETTINGS.clickmap,
      ),
      trackLinks: parseBool(
        map.get(APP_SETTING_KEYS.YANDEX_METRIKA_TRACK_LINKS),
        DEFAULT_YANDEX_METRIKA_SETTINGS.trackLinks,
      ),
      accurateTrackBounce: parseBool(
        map.get(APP_SETTING_KEYS.YANDEX_METRIKA_ACCURATE_BOUNCE),
        DEFAULT_YANDEX_METRIKA_SETTINGS.accurateTrackBounce,
      ),
    };
  }

  async getYandexMetrikaPublic(): Promise<YandexMetrikaPublicConfig> {
    const admin = await this.getYandexMetrikaAdmin();
    return {
      counterId: admin.counterId || null,
      webvisor: admin.webvisor,
      clickmap: admin.clickmap,
      trackLinks: admin.trackLinks,
      accurateTrackBounce: admin.accurateTrackBounce,
    };
  }

  async saveYandexMetrika(
    input: Partial<YandexMetrikaAdminSettings>,
  ): Promise<YandexMetrikaAdminSettings> {
    const current = await this.getYandexMetrikaAdmin();
    const next: YandexMetrikaAdminSettings = {
      counterId:
        input.counterId !== undefined
          ? normalizeCounterId(input.counterId)
          : current.counterId,
      webvisor: input.webvisor ?? current.webvisor,
      clickmap: input.clickmap ?? current.clickmap,
      trackLinks: input.trackLinks ?? current.trackLinks,
      accurateTrackBounce:
        input.accurateTrackBounce ?? current.accurateTrackBounce,
    };

    const entries: Array<{ key: string; value: string }> = [
      {
        key: APP_SETTING_KEYS.YANDEX_METRIKA_COUNTER_ID,
        value: next.counterId,
      },
      {
        key: APP_SETTING_KEYS.YANDEX_METRIKA_WEBVISOR,
        value: next.webvisor ? 'true' : 'false',
      },
      {
        key: APP_SETTING_KEYS.YANDEX_METRIKA_CLICKMAP,
        value: next.clickmap ? 'true' : 'false',
      },
      {
        key: APP_SETTING_KEYS.YANDEX_METRIKA_TRACK_LINKS,
        value: next.trackLinks ? 'true' : 'false',
      },
      {
        key: APP_SETTING_KEYS.YANDEX_METRIKA_ACCURATE_BOUNCE,
        value: next.accurateTrackBounce ? 'true' : 'false',
      },
    ];

    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.appSetting.upsert({
          where: { key: entry.key },
          create: entry,
          update: { value: entry.value },
        }),
      ),
    );

    return next;
  }
}
