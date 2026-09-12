export type ClubScheduleDay = {
  day: number;
  closed: boolean;
  open: string | null;
  close: string | null;
};

export type ClubListItem = {
  id: string;
  name: string;
  description: string | null;
  address: string;
  lat: number;
  lng: number;
  city: { id: string; name: string; region: string | null } | null;
  schedule: ClubScheduleDay[];
  isPublished: boolean;
  coverUrl: string | null;
  galleryUrls: string[];
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
  shortName?: string;
};
