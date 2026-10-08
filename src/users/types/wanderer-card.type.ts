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
  gameCostFormat: 'free' | 'paid' | 'both' | null;
  sessionPriceKind: 'fixed' | 'from' | 'range' | null;
  sessionPriceMin: number | null;
  sessionPriceMax: number | null;
  playerPaymentFormat: 'free_only' | 'free_and_paid' | null;
  playerBudgetKind: 'fixed' | 'from' | 'range' | null;
  playerBudgetMin: number | null;
  playerBudgetMax: number | null;
  experienceLabel: string | null;
  profileCard: ImageUrls | null;
  blockedByMe: boolean;
  badges: Array<'alpha_tester' | 'bug_hunter' | 'founding_dm' | 'early_arrival' | 'tavern_keeper'>;
  avatarFrameId: string | null;
  questionnaireAuraId: string | null;
  online: boolean;
  lastSeenAt: string | null;
  /** Заполняется только в getWandererCard (просмотр анкеты напрямую). */
  isFavorite?: boolean;
};
