import { BadRequestException } from '@nestjs/common';

export type CloudShareKind = 'yandex-disk';

export function detectCloudShare(rawUrl: string): CloudShareKind | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (
      host === 'disk.yandex.ru' ||
      host === 'disk.yandex.com' ||
      host === 'yadi.sk' ||
      host.endsWith('.disk.yandex.net')
    ) {
      return 'yandex-disk';
    }
    return null;
  } catch {
    return null;
  }
}

/** Прямой временный href с публичного API Яндекс Диска — без прокси на нашей стороне. */
export async function resolveCloudPlaybackUrl(rawUrl: string): Promise<{
  playbackUrl: string;
  titleHint: string | null;
  kind: CloudShareKind;
}> {
  const kind = detectCloudShare(rawUrl);
  if (kind !== 'yandex-disk') {
    throw new BadRequestException('Неизвестная ссылка на облако');
  }
  return resolveYandexDisk(rawUrl);
}

async function resolveYandexDisk(rawUrl: string): Promise<{
  playbackUrl: string;
  titleHint: string | null;
  kind: 'yandex-disk';
}> {
  const publicKey = rawUrl.trim();
  const api = new URL(
    'https://cloud-api.yandex.net/v1/disk/public/resources/download',
  );
  api.searchParams.set('public_key', publicKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(api.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!response.ok) {
      throw new BadRequestException(
        'Яндекс Диск не отдал файл. Сделайте ссылку публичной',
      );
    }
    const body = (await response.json()) as { href?: string };
    if (!body.href) {
      throw new BadRequestException('Яндекс Диск не вернул ссылку на скачивание');
    }
    return {
      playbackUrl: body.href,
      titleHint: null,
      kind: 'yandex-disk',
    };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Не удалось открыть ссылку Яндекс Диска');
  }
}

export function titleHintFromCloudUrl(rawUrl: string): string | null {
  try {
    const path = decodeURIComponent(new URL(rawUrl).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (!last || last === 'view' || last === 'edit') return null;
    if (last.includes('.')) return last.replace(/\.[^.]+$/, '') || null;
    return null;
  } catch {
    return null;
  }
}
