import type { ImageUrls } from '../../image/image.types';

export type GameKindDto = 'ONESHOT' | 'CAMPAIGN';
export type GameStatusDto = 'RECRUITING' | 'CLOSED' | 'FINISHED';

export type GameViewerRelation = 'none' | 'owner' | 'pending' | 'player' | 'rejected';

export type GameOwnerSummary = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

export type GameListItem = {
  id: string;
  title: string;
  description: string | null;
  maxPlayers: number;
  durationHours: number | null;
  kind: GameKindDto;
  status: GameStatusDto;
  isOnline: boolean;
  city: { id: string; name: string; region: string | null } | null;
  scheduledAt: string | null;
  timezone: string;
  priceRub: number | null;
  isFree: boolean;
  experienceTypeId: string | null;
  experienceLabel: string | null;
  beginnersWelcome: boolean;
  minAge: number | null;
  anyAge: boolean;
  systemName: string;
  cover: ImageUrls | null;
  playersCount: number;
  pendingApplicationsCount: number;
  owner: GameOwnerSummary | null;
  viewerRelation: GameViewerRelation;
  createdAt: string;
  updatedAt: string;
};

export type GamePersonItem = {
  id: string;
  userId: string;
  nickname: string;
  age: number | null;
  about: string | null;
  message: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type GameManagePayload = {
  game: GameListItem;
  applications: GamePersonItem[];
  players: GamePersonItem[];
};
