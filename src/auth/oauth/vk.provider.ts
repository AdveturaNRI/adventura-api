import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import type { OAuthIdentity } from './oauth.types';

type VkSilentExchangeResponse = {
  response?: {
    user_id?: number | string;
    email?: string;
    access_token?: string;
  };
  error?: {
    error_code?: number;
    error_msg?: string;
  };
};

type VkUserInfoResponse = {
  user?: {
    user_id?: string | number;
    email?: string;
    avatar?: string;
    first_name?: string;
    last_name?: string;
  };
  user_id?: string | number;
  email?: string;
  error?: string;
  error_description?: string;
};

/** Prefer a large square crop for our avatar pipeline. */
function preferLargeVkAvatar(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set('cs', '720x720');
    return parsed.toString();
  } catch {
    return raw;
  }
}

@Injectable()
export class VkOAuthProvider {
  private readonly logger = new Logger(VkOAuthProvider.name);

  constructor(private readonly config: ConfigService) {}

  async resolveFromAccessToken(accessToken: string): Promise<OAuthIdentity> {
    const clientId = this.config.get<string>('VK_APP_ID')?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException('VK ID не настроен (VK_APP_ID)');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      access_token: accessToken.trim(),
    });

    let payload: VkUserInfoResponse;
    try {
      const res = await fetch('https://id.vk.ru/oauth2/user_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      payload = (await res.json()) as VkUserInfoResponse;
      if (!res.ok) {
        throw new Error(
          payload.error_description || payload.error || `HTTP ${res.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `VK user_info failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Не удалось проверить VK ID токен');
    }

    const userId = payload.user?.user_id ?? payload.user_id;
    if (!userId) {
      throw new BadRequestException('Недействительный VK ID токен');
    }

    const email =
      payload.user?.email?.trim().toLowerCase() ||
      payload.email?.trim().toLowerCase() ||
      null;
    const avatarUrl = preferLargeVkAvatar(payload.user?.avatar);

    if (!email) {
      this.logger.warn(
        `VK user_info without email for user_id=${userId} (check app email access + scope=email)`,
      );
    }

    return {
      provider: OAuthProvider.VK,
      providerUserId: String(userId),
      email,
      avatarUrl,
    };
  }

  /** Legacy silent_token path (VK ID SDK < 2.x). */
  async resolveFromSilentToken(
    silentToken: string,
    uuid: string,
  ): Promise<OAuthIdentity> {
    const serviceToken = this.config.get<string>('VK_SERVICE_TOKEN')?.trim();
    if (!serviceToken) {
      throw new ServiceUnavailableException(
        'VK ID не настроен (VK_SERVICE_TOKEN)',
      );
    }

    const apiVersion =
      this.config.get<string>('VK_API_VERSION')?.trim() || '5.199';

    const body = new URLSearchParams({
      v: apiVersion,
      token: silentToken.trim(),
      access_token: serviceToken,
      uuid: uuid.trim(),
    });

    let payload: VkSilentExchangeResponse;
    try {
      const res = await fetch(
        'https://api.vk.com/method/auth.exchangeSilentAuthToken',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      payload = (await res.json()) as VkSilentExchangeResponse;
    } catch (error) {
      this.logger.warn(
        `VK silent exchange failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Не удалось проверить VK ID токен');
    }

    if (payload.error || !payload.response?.user_id) {
      this.logger.warn(
        `VK silent exchange error: ${payload.error?.error_msg ?? 'no user_id'}`,
      );
      throw new BadRequestException(
        payload.error?.error_msg || 'Недействительный VK ID токен',
      );
    }

    const email = payload.response.email?.trim().toLowerCase() || null;
    if (!email) {
      this.logger.warn(
        `VK silent exchange without email for user_id=${payload.response.user_id}`,
      );
    }

    // Silent exchange has no avatar field — leave null.
    return {
      provider: OAuthProvider.VK,
      providerUserId: String(payload.response.user_id),
      email,
      avatarUrl: null,
    };
  }
}
