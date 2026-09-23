import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import {
  APP_SETTING_KEYS,
  DEFAULT_YANDEX_METRIKA_SETTINGS,
  type FirebasePushAdminSettings,
  type VkAdsPixelAdminSettings,
  type VkAdsPixelPublicConfig,
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

function normalizeVkAdsPixelId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!/^\d{1,20}$/.test(trimmed)) {
    throw new Error('ID пикселя VK Ads должен состоять только из цифр');
  }
  return trimmed;
}

function normalizeVapidKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  // Firebase Web Push certificate public key is URL-safe base64, typically ~87 chars.
  if (trimmed.length < 20 || /\s/.test(trimmed)) {
    throw new Error(
      'Некорректный Web Push VAPID key. Нужен Public key из Cloud Messaging → Web Push certificates (обычно начинается с B).',
    );
  }
  return trimmed;
}

function normalizeServiceAccountJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Service account JSON невалиден (не JSON). Нужен файл ключа из Firebase → Project settings → Service accounts → Generate new private key.',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Service account JSON должен быть объектом');
  }

  const obj = parsed as Record<string, unknown>;

  // Common mistake: paste Firebase web app config (apiKey / appId) instead of SA.
  if (
    typeof obj.apiKey === 'string' ||
    typeof obj.messagingSenderId === 'string' ||
    typeof obj.appId === 'string'
  ) {
    throw new Error(
      'Это Firebase Web config (apiKey/appId), а не service account. Поле Service account оставь пустым — для включения пушей на клиенте достаточно VAPID. Service account: Project settings → Service accounts → Generate new private key (type: "service_account").',
    );
  }

  if (obj.type !== 'service_account') {
    throw new Error(
      'В JSON должно быть "type": "service_account". Скачай ключ: Firebase Console → ⚙️ Project settings → Service accounts → Generate new private key.',
    );
  }

  if (typeof obj.private_key !== 'string' || typeof obj.client_email !== 'string') {
    throw new Error(
      'В service account JSON не хватает private_key / client_email',
    );
  }

  return trimmed;
}

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Public OAuth client ids for web SDK (no secrets). */
  getOauthPublic() {
    const vkAppId = this.config.get<string>('VK_APP_ID')?.trim() || '';
    const yandexClientId =
      this.config.get<string>('YANDEX_CLIENT_ID')?.trim() || '';

    return {
      vk: {
        enabled: Boolean(vkAppId),
        appId: vkAppId || null,
      },
      yandex: {
        enabled: Boolean(yandexClientId),
        clientId: yandexClientId || null,
      },
    };
  }

  async getYandexMetrikaAdmin(): Promise<YandexMetrikaAdminSettings> {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            APP_SETTING_KEYS.YANDEX_METRIKA_COUNTER_ID,
            APP_SETTING_KEYS.YANDEX_METRIKA_WEBVISOR,
            APP_SETTING_KEYS.YANDEX_METRIKA_CLICKMAP,
            APP_SETTING_KEYS.YANDEX_METRIKA_TRACK_LINKS,
            APP_SETTING_KEYS.YANDEX_METRIKA_ACCURATE_BOUNCE,
          ],
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

  async getVkAdsPixelAdmin(): Promise<VkAdsPixelAdminSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.VK_ADS_PIXEL_ID },
    });
    return { pixelId: row?.value?.trim() ?? '' };
  }

  async getVkAdsPixelPublic(): Promise<VkAdsPixelPublicConfig> {
    const { pixelId } = await this.getVkAdsPixelAdmin();
    return { pixelId: pixelId || null };
  }

  async saveVkAdsPixel(
    input: Partial<VkAdsPixelAdminSettings>,
  ): Promise<VkAdsPixelAdminSettings> {
    const current = await this.getVkAdsPixelAdmin();
    const pixelId =
      input.pixelId === undefined
        ? current.pixelId
        : normalizeVkAdsPixelId(input.pixelId);

    await this.prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.VK_ADS_PIXEL_ID },
      create: { key: APP_SETTING_KEYS.VK_ADS_PIXEL_ID, value: pixelId },
      update: { value: pixelId },
    });

    return { pixelId };
  }

  /** DB override for Firebase Web Push certificate public key. */
  async getFirebaseWebVapidKey(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.FIREBASE_WEB_VAPID_KEY },
    });
    return row?.value?.trim() ?? '';
  }

  async getFirebaseProjectId(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.FIREBASE_PROJECT_ID },
    });
    return row?.value?.trim() ?? '';
  }

  async getFirebaseServiceAccountJson(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: APP_SETTING_KEYS.FIREBASE_SERVICE_ACCOUNT_JSON },
    });
    return row?.value?.trim() ?? '';
  }

  /**
   * Resolved VAPID for client subscribe: DB → env FIREBASE_WEB_VAPID_KEY → env VAPID_PUBLIC_KEY.
   */
  async resolveFirebaseWebVapidKey(): Promise<string> {
    const fromDb = await this.getFirebaseWebVapidKey();
    if (fromDb) {
      return fromDb;
    }
    return (
      this.config.get<string>('FIREBASE_WEB_VAPID_KEY')?.trim() ||
      this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ||
      ''
    );
  }

  async resolveFirebaseServiceAccountJson(): Promise<string> {
    const fromDb = await this.getFirebaseServiceAccountJson();
    if (fromDb) {
      return fromDb;
    }
    return this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim() || '';
  }

  async getFirebasePushAdmin(status: {
    subscribeEnabled: boolean;
    sendEnabled: boolean;
    provider: 'fcm' | 'webpush' | 'none';
  }): Promise<FirebasePushAdminSettings> {
    const [webVapidKey, projectId, saDb] = await Promise.all([
      this.getFirebaseWebVapidKey(),
      this.getFirebaseProjectId(),
      this.getFirebaseServiceAccountJson(),
    ]);
    const envVapid = Boolean(
      this.config.get<string>('FIREBASE_WEB_VAPID_KEY')?.trim() ||
        this.config.get<string>('VAPID_PUBLIC_KEY')?.trim(),
    );
    const envSa = Boolean(
      this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim() ||
        this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')?.trim(),
    );
    const envProject =
      this.config.get<string>('FIREBASE_PROJECT_ID')?.trim() || '';

    return {
      webVapidKey,
      projectId: projectId || envProject,
      serviceAccountConfigured: Boolean(saDb) || envSa,
      envVapidConfigured: envVapid,
      envServiceAccountConfigured: envSa,
      subscribeEnabled: status.subscribeEnabled,
      sendEnabled: status.sendEnabled,
      provider: status.provider,
    };
  }

  async saveFirebasePush(input: {
    webVapidKey?: string;
    projectId?: string;
    /** Empty string clears DB override; undefined leaves unchanged. */
    serviceAccountJson?: string;
  }): Promise<void> {
    const entries: Array<{ key: string; value: string }> = [];

    if (input.webVapidKey !== undefined) {
      entries.push({
        key: APP_SETTING_KEYS.FIREBASE_WEB_VAPID_KEY,
        value: normalizeVapidKey(input.webVapidKey),
      });
    }
    if (input.projectId !== undefined) {
      entries.push({
        key: APP_SETTING_KEYS.FIREBASE_PROJECT_ID,
        value: input.projectId.trim(),
      });
    }
    if (input.serviceAccountJson !== undefined) {
      entries.push({
        key: APP_SETTING_KEYS.FIREBASE_SERVICE_ACCOUNT_JSON,
        value: normalizeServiceAccountJson(input.serviceAccountJson),
      });
    }

    if (entries.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.appSetting.upsert({
          where: { key: entry.key },
          create: entry,
          update: { value: entry.value },
        }),
      ),
    );
  }
}
