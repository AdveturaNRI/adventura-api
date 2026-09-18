export const APP_SETTING_KEYS = {
  YANDEX_METRIKA_COUNTER_ID: 'yandex_metrika_counter_id',
  YANDEX_METRIKA_WEBVISOR: 'yandex_metrika_webvisor',
  YANDEX_METRIKA_CLICKMAP: 'yandex_metrika_clickmap',
  YANDEX_METRIKA_TRACK_LINKS: 'yandex_metrika_track_links',
  YANDEX_METRIKA_ACCURATE_BOUNCE: 'yandex_metrika_accurate_bounce',
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
