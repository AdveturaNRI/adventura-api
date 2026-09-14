import type { ImageUrls } from '../../image/image.types';

export type WandererCard = {
  id: string;
  nickname: string;
  age: number | null;
  tagline: string | null;
  roles: string[];
  availability: string | null;
  timezone: string;
  systems: string[];
  readyToLearnNew: boolean;
  openToAnySystem: boolean;
  about: string | null;
  description: string | null;
  location: string | null;
  cities: string[];
  playsOnline: boolean;
  experienceLabel: string | null;
  profileCard: ImageUrls | null;
  blockedByMe: boolean;
  /** Заполняется только в getWandererCard (просмотр анкеты напрямую). */
  isFavorite?: boolean;
};
