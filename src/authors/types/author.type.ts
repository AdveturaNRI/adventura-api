export const CREATIVITY_CATEGORIES = [
  'arts',
  'maps',
  'materials',
  'forGames',
  'memes',
  'other',
] as const;

export type CreativityCategory = (typeof CREATIVITY_CATEGORIES)[number];

export const AUTHOR_CONTACT_TYPES = [
  'telegram',
  'vk',
  'discord',
  'youtube',
  'twitch',
  'boosty',
  'email',
  'website',
  'other',
] as const;

export type AuthorContactType = (typeof AUTHOR_CONTACT_TYPES)[number];

export type AuthorContactDto = {
  type: AuthorContactType;
  label: string;
  url: string;
};

export type AuthorPostFileDto = {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  previewUrl?: string;
};

export type AuthorDto = {
  id: string;
  name: string;
  avatar: string;
  badges: string[];
  avatarFrameId: string | null;
  categories: CreativityCategory[];
  description: string;
  contacts: AuthorContactDto[];
  postIds: string[];
};

export type AuthorPostDto = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  category: CreativityCategory;
  images: string[];
  files: AuthorPostFileDto[];
  createdAt: string;
  views: number;
  likes: number;
  liked: boolean;
  isForSale: boolean;
  price?: number;
  currency?: string;
  purchaseDescription?: string;
  purchaseUrl?: string;
};

export type AuthorFileMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  index: number;
};
