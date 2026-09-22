import { Injectable } from '@nestjs/common';
import { GameStatus, type Prisma } from '@prisma/client';

import { MediaService } from '../../media/media.service';
import { PrismaService } from '../../prisma/prisma.service';

const GAME_ENTITY_TYPE = 'Game';
const GAME_COVER_COLLECTION = 'cover';
const CLUB_ENTITY_TYPE = 'Club';
const CLUB_COVER_COLLECTION = 'cover';

@Injectable()
export class MarketingFeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async listGames(limit = 12) {
    const take = Math.max(1, Math.min(50, limit));
    const games = await this.prisma.game.findMany({
      where: {
        status: GameStatus.RECRUITING,
        owner: { isGuest: false },
      },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        status: true,
        isOnline: true,
        scheduledAt: true,
        timezone: true,
        priceRub: true,
        beginnersWelcome: true,
        minAge: true,
        updatedAt: true,
        city: { select: { id: true, name: true, region: true } },
        userGameSystem: { select: { name: true } },
        owner: { select: { id: true, nickname: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take,
    });

    return Promise.all(
      games.map(async (game) => {
        const coverMedia = await this.media.getCollection({
          entityType: GAME_ENTITY_TYPE,
          entityId: game.id,
          collection: GAME_COVER_COLLECTION,
        });
        const urls = coverMedia.length
          ? await this.media.getCollectionUrls(coverMedia)
          : {};
        const coverUrl =
          urls.cardThumb ?? urls.card ?? urls.original ?? urls.medium ?? urls.large ?? null;

        return {
          id: game.id,
          title: game.title,
          description: game.description,
          kind: game.kind,
          isOnline: game.isOnline,
          city: game.city,
          scheduledAt: game.scheduledAt?.toISOString() ?? null,
          timezone: game.timezone || 'Europe/Moscow',
          isFree: game.priceRub == null,
          priceRub: game.priceRub,
          beginnersWelcome: game.beginnersWelcome,
          minAge: game.minAge,
          systemName: game.userGameSystem.name,
          owner: game.owner,
          coverUrl,
        };
      }),
    );
  }

  async listClubs(limit = 12) {
    const take = Math.max(1, Math.min(50, limit));
    const clubs = await this.prisma.club.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        lat: true,
        lng: true,
        updatedAt: true,
        city: { select: { id: true, name: true, region: true } },
      } satisfies Prisma.ClubSelect,
      orderBy: [{ updatedAt: 'desc' }],
      take,
    });

    return Promise.all(
      clubs.map(async (club) => {
        const coverMedia = await this.media.getCollection({
          entityType: CLUB_ENTITY_TYPE,
          entityId: club.id,
          collection: CLUB_COVER_COLLECTION,
        });
        const urls = coverMedia.length
          ? await this.media.getCollectionUrls(coverMedia)
          : {};
        const coverUrl =
          urls.cardThumb ?? urls.card ?? urls.original ?? urls.medium ?? urls.large ?? null;
        return {
          id: club.id,
          name: club.name,
          description: club.description,
          address: club.address,
          lat: club.lat,
          lng: club.lng,
          city: club.city,
          coverUrl,
        };
      }),
    );
  }
}

