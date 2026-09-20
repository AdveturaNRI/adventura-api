export const APP_SETTING_KEYS = {
  YANDEX_METRIKA_COUNTER_ID: 'yandex_metrika_counter_id',
  YANDEX_METRIKA_WEBVISOR: 'yandex_metrika_webvisor',
  YANDEX_METRIKA_CLICKMAP: 'yandex_metrika_clickmap',
  YANDEX_METRIKA_TRACK_LINKS: 'yandex_metrika_track_links',
  YANDEX_METRIKA_ACCURATE_BOUNCE: 'yandex_metrika_accurate_bounce',
  FIREBASE_WEB_VAPID_KEY: 'firebase_web_vapid_key',
  FIREBASE_PROJECT_ID: 'firebase_project_id',
  FIREBASE_SERVICE_ACCOUNT_JSON: 'firebase_service_account_json',
} as const;

export type YandexMetrikaAdminSettings = {
  counterId: string;
  webvisor: boolean;
  clickmap: boolean;
  trackLinks: boolean;
  accurateTrackBounce: boolean;
};

export type YandexMetrikaPublicConfig = {
  counterId: string | null;
  webvisor: boolean;
  clickmap: boolean;
  trackLinks: boolean;
  accurateTrackBounce: boolean;
};

export const DEFAULT_YANDEX_METRIKA_SETTINGS: YandexMetrikaAdminSettings = {
  counterId: '',
  webvisor: true,
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
};

/** Admin form for FCM / Web Push. serviceAccountJson is write-only in UI. */
export type FirebasePushAdminSettings = {
  webVapidKey: string;
  projectId: string;
  /** True if a service account JSON is stored (env or DB). */
  serviceAccountConfigured: boolean;
  /** Env fallbacks present (read-only hints). */
  envVapidConfigured: boolean;
  envServiceAccountConfigured: boolean;
  /** Live push status after resolve. */
  subscribeEnabled: boolean;
  sendEnabled: boolean;
  provider: 'fcm' | 'webpush' | 'none';
};
