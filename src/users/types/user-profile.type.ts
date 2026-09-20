import type { ImageUrls } from '../../image/image.types';

export type ProfileCatalogItem = {
  id: string;
  name: string;
};

export type ProfileCity = {
  id: string;
  name: string;
  region: string | null;
  countryCode: string;
  countryName: string;
};

export type UserProfile = {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
  statuses: ProfileCatalogItem[];
  experienceTypes: ProfileCatalogItem[];
  availability: string | null;
  age: number | null;
  city: ProfileCity | null;
  cities: ProfileCity[];
  location: string | null;
  playsOnline: boolean;
  timezone: string;
  isPublic: boolean;
  systems: string[];
  readyToLearnNew: boolean;
  openToAnySystem: boolean;
  prefersFreeOnly: boolean;
  about: string | null;
  description: string | null;
  roles: string[];
  questionnaireStep: number;
  questionnaireCompletionPercent: number;
  notificationSoundsEnabled: boolean;
  notificationSoundPresetId: string | null;
  notificationSoundPresetSlug: string | null;
  useCustomNotificationSound: boolean;
  customNotificationSoundUrl: string | null;
  effectiveNotificationSoundUrl: string | null;
  avatar: ImageUrls | null;
  profileCard: ImageUrls | null;
  createdAt: Date;
  updatedAt: Date;
};
