import type { OAuthProvider } from '@prisma/client';

export type OAuthIdentity = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
};

export type OAuthLoginMeta = {
  anonymousId?: string;
  acquisitionSource?: string;
};

export type LinkedOAuthProvider = 'vk' | 'yandex';
