import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Public marketing is deliberately more restrictive than the signed-in feed.
  // A deleted questionnaire resets isPublic/age; accounts are hard-deleted.
  private readonly publicWandererWhere = {
    isGuest: false, isPublic: true, age: { gte: 18 },
    blocksReceived: { none: {} },
  } satisfies Prisma.UserWhereInput;

  private async cover(entityType: string, entityId: string, collection: string) {
    const media = await this.media.getCollection({ entityType, entityId, collection });
    const urls = media.length ? await this.media.getCollectionUrls(media) : {};
    return urls.card ?? urls.original ?? urls.medium ?? urls.cardThumb ?? null;
  }

  async listWanderers(limit = 12, nickname?: string) {
    const users = await this.prisma.user.findMany({
      where: { ...this.publicWandererWhere, ...(nickname ? { nickname } : {}) },
      select: {
        id: true,
        nickname: true,
        about: true,
        description: true,
        systems: true,
        experiences: {
          take: 1,
          select: { experienceType: { select: { name: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(50, limit)),
    });
    return Promise.all(
      users.map(async (user) => {
        const experience = user.experiences[0]?.experienceType?.name?.trim() || '';
        const systems = user.systems.slice(0, 4).join(' · ');
        const meta = [experience, systems].filter(Boolean).join(' · ');
        return {
          key: user.nickname,
          title: user.nickname,
          description: (user.about || user.description || '').slice(0, 240),
          meta,
          imageUrl:
            (await this.cover('User', user.id, 'profileCard')) ??
            (await this.cover('User', user.id, 'avatar')),
          url: `/people/${encodeURIComponent(user.nickname)}`,
        };
      }),
    );
  }

  async getWanderer(nickname: string) {
    const [card] = await this.listWanderers(1, nickname);
    if (!card) throw new NotFoundException('Публичная анкета не найдена');
    return card;
  }

  async listPublications(limit = 12) {
    // Posts become public on creation in the current author model; there is no draft status.
    const posts = await this.prisma.authorPost.findMany({
      where: { deletedAt: null, isForSale: false, authorProfile: { user: this.publicWandererWhere } },
      select: { id: true, title: true, content: true, authorProfile: { select: { userId: true, user: { select: { nickname: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: Math.max(1, Math.min(50, limit)),
    });
    return Promise.all(posts.map(async (post) => ({
      key: post.id, title: post.title,
      description: post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
      meta: post.authorProfile.user.nickname,
      imageUrl: await this.cover('author_post', post.id, 'image-0'),
      url: `/authors/${encodeURIComponent(post.authorProfile.userId)}/posts/${encodeURIComponent(post.id)}`,
    })));
  }

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
        maxPlayers: true,
        durationHours: true,
        updatedAt: true,
        city: { select: { id: true, name: true, region: true } },
        userGameSystem: { select: { name: true } },
        experienceType: { select: { name: true } },
        owner: { select: { id: true, nickname: true } },
        _count: { select: { players: true } },
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
        // Prefer display sizes — cardThumb is 128px and looks muddy on landing cards.
        const coverUrl =
          urls.card ?? urls.original ?? urls.large ?? urls.medium ?? urls.cardThumb ?? null;

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
          maxPlayers: game.maxPlayers,
          playersCount: game._count.players,
          durationHours: game.durationHours,
          experienceLabel: game.experienceType?.name ?? null,
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
          urls.card ?? urls.original ?? urls.large ?? urls.medium ?? urls.cardThumb ?? null;
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

