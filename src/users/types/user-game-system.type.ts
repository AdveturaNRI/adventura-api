export type UserGameSystemAuthor = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

export type UserGameSystemItem = {
  id: string;
  name: string;
  gamesCount: number;
  canEdit: boolean;
  canDelete: boolean;
  author: UserGameSystemAuthor;
};
