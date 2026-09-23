import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../common/upload.constants';

/** Чуть выше общего лимита: трек 5–7 мин на 192 kbps. */
export const MAX_MUSIC_TRACK_BYTES = Math.max(
  MAX_UPLOAD_FILE_SIZE_BYTES,
  20 * 1024 * 1024,
);

/** Общий лимит библиотеки на пользователя (только загруженные файлы). */
export const MAX_MUSIC_LIBRARY_BYTES = 300 * 1024 * 1024;

/** Сколько треков по внешней ссылке можно держать. */
export const MAX_MUSIC_EXTERNAL_TRACKS = 100;

/**
 * Signed URL для треков живут дольше обычных картинок:
 * за столом сессия легко тянется несколько часов.
 */
export const MUSIC_SIGNED_URL_EXPIRES_SEC = 12 * 60 * 60;

export const MUSIC_TRACK_ENTITY = 'MusicTrack';
export const MUSIC_TRACK_COLLECTION = 'audio';
