import type { OAuthProvider } from '@prisma/client';

export type OAuthIdentity = {
  provider: OAuthProvider;
  providerUserId: string;
  /** Real email from provider when scope/consent allows; otherwise null. */
  email: string | null;
  /** Public profile photo URL from provider; may be null / empty. */
  avatarUrl: string | null;
};

export type OAuthLoginMeta = {
  anonymousId?: string;
  acquisitionSource?: string;
};

export type LinkedOAuthProvider = 'vk' | 'yandex';

/** Placeholder used when the provider did not return an email. */
export const SYNTHETIC_OAUTH_EMAIL_RE =
  /^[a-z]+_.+@oauth\.adventura\.local$/i;
