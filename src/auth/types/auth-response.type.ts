export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};
