export type LinkedOAuthProvider = 'vk' | 'yandex';

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
  emailVerified: boolean;
  linkedProviders: LinkedOAuthProvider[];
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};
