import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import type { OAuthIdentity } from './oauth.types';

type YandexInfoResponse = {
  id?: string;
  default_email?: string;
  emails?: string[];
  login?: string;
  error?: string;
  error_description?: string;
};

@Injectable()
export class YandexOAuthProvider {
  private readonly logger = new Logger(YandexOAuthProvider.name);

  constructor(private readonly config: ConfigService) {}

  async resolveIdentity(accessToken: string): Promise<OAuthIdentity> {
    const clientId = this.config.get<string>('YANDEX_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Яндекс ID не настроен (YANDEX_CLIENT_ID)',
      );
    }

    let payload: YandexInfoResponse;
    try {
      const res = await fetch('https://login.yandex.ru/info?format=json', {
        method: 'GET',
        headers: {
          Authorization: `OAuth ${accessToken.trim()}`,
        },
      });
      payload = (await res.json()) as YandexInfoResponse;
      if (!res.ok) {
        throw new Error(
          payload.error_description || payload.error || `HTTP ${res.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Yandex info failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Не удалось проверить Яндекс ID токен');
    }

    if (!payload.id) {
      throw new BadRequestException('Недействительный Яндекс ID токен');
    }

    const email =
      payload.default_email?.trim().toLowerCase() ||
      payload.emails?.[0]?.trim().toLowerCase() ||
      null;

    return {
      provider: OAuthProvider.YANDEX,
      providerUserId: String(payload.id),
      email,
    };
  }
}
