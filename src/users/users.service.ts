import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { WandererReactionType } from '@prisma/client';

import { ImageProcessorService } from '../image/image-processor.service';
import {
  normalizeGameSystemName,
  resolveGameSystemNames,
} from '../common/utils/game-system-name.utils';
import { ChatsService } from '../chats/chats.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type {
  WandererBucket,
} from './dto/wanderer-reaction.dto';
import type { UserProfile } from './types/user-profile.type';
import type { WandererCard } from './types/wanderer-card.type';
import {
  buildQuestionnaireCompletionInput,
  calculateQuestionnaireCompletionPercent,
  isEligibleForWanderersFeed,
} from './utils/questionnaire-completion.util';

const USER_PROFILE_SELECT = {
  id: true,
  email: true,
  nickname: true,
  isGuest: true,
  availability: true,
  age: true,
  location: true,
  cityId: true,
  playsOnline: true,
  timezone: true,
  isPublic: true,
  systems: true,
  readyToLearnNew: true,
  openToAnySystem: true,
  about: true,
  description: true,
  roles: true,
  questionnaireStep: true,
  createdAt: true,
  updatedAt: true,
  statuses: {
    select: {
      status: {
        select: { id: true, name: true },
      },
    },
  },
  experiences: {
    select: {
      experienceType: {
        select: { id: true, name: true },
      },
    },
  },
  city: {
    select: {
      id: true,
      name: true,
      region: true,
      country: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  },
  userCities: {
    orderBy: { sortOrder: 'asc' },
    select: {
      sortOrder: true,
      city: {
        select: {
          id: true,
          name: true,
          region: true,
          country: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

const AVATAR_COLLECTION = 'avatar';
const PROFILE_CARD_COLLECTION = 'profileCard';
const USER_ENTITY_TYPE = 'User';

type UserWithRelations = {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
  availability: string | null;
  age: number | null;
  location: string | null;
  cityId: string | null;
  playsOnline: boolean;
  timezone: string;
  isPublic: boolean;
  systems: string[];
  readyToLearnNew: boolean;
  openToAnySystem: boolean;
  about: string | null;
  description: string | null;
  roles: string[];
  questionnaireStep: number;
  createdAt: Date;
  updatedAt: Date;
  statuses: { status: { id: string; name: string } }[];
  experiences: { experienceType: { id: string; name: string } }[];
  city: {
    id: string;
    name: string;
    region: string | null;
    country: { code: string; name: string };
  } | null;
  userCities: {
    sortOrder: number;
    city: {
      id: string;
      name: string;
      region: string | null;
      country: { code: string; name: string };
    };
  }[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ChatsService))
    private readonly chatsService: ChatsService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PROFILE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return this.toProfile(user);
  }

  async listWanderers(
    viewerId: string,
    bucket: WandererBucket = 'feed',
  ): Promise<WandererCard[]> {
    const reactionType =
      bucket === 'favorites'
        ? WandererReactionType.FAVORITE
        : bucket === 'skipped'
          ? WandererReactionType.SKIPPED
          : null;

    const reactedIds = await this.prisma.wandererReaction.findMany({
      where: {
        viewerId,
        ...(reactionType ? { type: reactionType } : {}),
      },
      select: { targetUserId: true },
    });

    const reactedIdSet = new Set(reactedIds.map((item) => item.targetUserId));
    const blockRows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true, createdAt: true },
    });
    const blockedByMeIds = new Set(
      blockRows
        .filter((row) => row.blockerId === viewerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((row) => row.blockedId),
    );
    const blockedMeIds = new Set(
      blockRows.filter((row) => row.blockedId === viewerId).map((row) => row.blockerId),
    );

    if (bucket === 'favorites' || bucket === 'skipped') {
      // «Скрытые» keep everyone I skipped or blocked, even if they blocked me back.
      // Feed still excludes people who blocked me.
      const targetIds =
        bucket === 'skipped'
          ? [...new Set([...reactedIdSet, ...blockedByMeIds])]
          : [...reactedIdSet].filter(
              (id) => !blockedByMeIds.has(id) && !blockedMeIds.has(id),
            );

      if (targetIds.length === 0) {
        return [];
      }

      const users = await this.prisma.user.findMany({
        where:
          bucket === 'skipped' && blockedByMeIds.size > 0
            ? {
                id: { in: targetIds },
                OR: [{ isPublic: true }, { id: { in: [...blockedByMeIds] } }],
              }
            : {
                id: { in: targetIds },
                isPublic: true,
              },
        select: USER_PROFILE_SELECT,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });

      const cardsById = new Map(
        (
          await Promise.all(
            users.map((user) =>
              this.toWandererCard(user, {
                blockedByMe: blockedByMeIds.has(user.id),
                // Избранные/скрытые — уже известные люди: показываем даже если анкета стала неполной.
                includeIncomplete: true,
              }),
            ),
          )
        )
          .filter((card): card is WandererCard => card !== null)
          .map((card) => [card.id, card]),
      );

      const orderedReactions = await this.prisma.wandererReaction.findMany({
        where: {
          viewerId,
          type: reactionType!,
        },
        orderBy: { updatedAt: 'desc' },
        select: { targetUserId: true },
        take: 100,
      });

      if (bucket === 'favorites') {
        return orderedReactions
          .map((reaction) => cardsById.get(reaction.targetUserId))
          .filter((card): card is WandererCard => Boolean(card));
      }

      const seen = new Set<string>();
      const ordered: WandererCard[] = [];

      for (const id of blockedByMeIds) {
        const card = cardsById.get(id);
        if (card) {
          ordered.push(card);
          seen.add(id);
        }
      }

      for (const reaction of orderedReactions) {
        if (seen.has(reaction.targetUserId)) {
          continue;
        }
        const card = cardsById.get(reaction.targetUserId);
        if (card) {
          ordered.push(card);
          seen.add(reaction.targetUserId);
        }
      }

      return ordered;
    }

    const feedExcludeIds = [
      ...new Set([viewerId, ...reactedIdSet, ...blockedByMeIds, ...blockedMeIds]),
    ];

    const others = await this.prisma.user.findMany({
      where: {
        isPublic: true,
        id: { notIn: feedExcludeIds },
      },
      select: USER_PROFILE_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return (
      await Promise.all(others.map((user) => this.toWandererCard(user)))
    ).filter((card): card is WandererCard => card !== null);
  }

  async getWandererCard(
    viewerId: string,
    targetUserId: string,
  ): Promise<WandererCard> {
    if (viewerId === targetUserId) {
      const self = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: USER_PROFILE_SELECT,
      });

      if (!self) {
        throw new NotFoundException('Пользователь не найден');
      }

      const selfCard = await this.toWandererCard(self, {
        includeIncomplete: true,
      });

      if (!selfCard) {
        throw new NotFoundException('Анкета недоступна');
      }

      return selfCard;
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: USER_PROFILE_SELECT,
    });

    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Чужая анкета видна, если она публичная или с пользователем есть диалог.
    const blockRow = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: { blockerId: viewerId, blockedId: targetUserId },
      },
      select: { id: true },
    });

    if (!target.isPublic) {
      const shared = await this.prisma.conversationParticipant.findFirst({
        where: {
          userId: viewerId,
          conversation: {
            participants: { some: { userId: targetUserId } },
          },
        },
        select: { conversationId: true },
      });

      if (!shared) {
        throw new NotFoundException('Анкета недоступна');
      }
    }

    const card = await this.toWandererCard(target, {
      blockedByMe: Boolean(blockRow),
      includeIncomplete: true,
    });

    if (!card) {
      throw new NotFoundException('Анкета недоступна');
    }

    const reaction = await this.prisma.wandererReaction.findUnique({
      where: {
        viewerId_targetUserId: { viewerId, targetUserId },
      },
      select: { type: true },
    });

    return { ...card, isFavorite: reaction?.type === WandererReactionType.FAVORITE };
  }

  async getWandererBucketCounts(
    viewerId: string,
  ): Promise<{ favorites: number; skipped: number }> {
    const [favoriteRows, skippedRows, blockedByMe] = await Promise.all([
      this.prisma.wandererReaction.findMany({
        where: { viewerId, type: WandererReactionType.FAVORITE },
        select: { targetUserId: true },
      }),
      this.prisma.wandererReaction.findMany({
        where: { viewerId, type: WandererReactionType.SKIPPED },
        select: { targetUserId: true },
      }),
      this.prisma.userBlock.findMany({
        where: { blockerId: viewerId },
        select: { blockedId: true },
      }),
    ]);

    const blockedByMeIds = new Set(blockedByMe.map((row) => row.blockedId));
    const favoriteIds = favoriteRows
      .map((row) => row.targetUserId)
      .filter((id) => !blockedByMeIds.has(id));
    const skippedIds = [
      ...new Set([
        ...skippedRows.map((row) => row.targetUserId),
        ...blockedByMeIds,
      ]),
    ];

    const [favorites, skipped] = await Promise.all([
      favoriteIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.user.count({
            where: { id: { in: favoriteIds }, isPublic: true },
          }),
      skippedIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.user.count({
            where:
              blockedByMeIds.size > 0
                ? {
                    id: { in: skippedIds },
                    OR: [{ isPublic: true }, { id: { in: [...blockedByMeIds] } }],
                  }
                : { id: { in: skippedIds }, isPublic: true },
          }),
    ]);

    return { favorites, skipped };
  }

  async upsertWandererReaction(
    viewerId: string,
    targetUserId: string,
    type: 'favorite' | 'skipped',
  ): Promise<{ targetUserId: string; type: 'favorite' | 'skipped' }> {
    if (viewerId === targetUserId) {
      throw new BadRequestException('Нельзя отметить свою анкету');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isPublic: true },
    });

    if (!target || !target.isPublic) {
      throw new NotFoundException('Анкета не найдена');
    }

    const blockedByMe = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: { blockerId: viewerId, blockedId: targetUserId },
      },
      select: { id: true },
    });

    if (blockedByMe && type === 'favorite') {
      throw new BadRequestException('Сначала разблокируйте пользователя');
    }

    const reactionType =
      type === 'favorite' ? WandererReactionType.FAVORITE : WandererReactionType.SKIPPED;

    const previous = await this.prisma.wandererReaction.findUnique({
      where: {
        viewerId_targetUserId: {
          viewerId,
          targetUserId,
        },
      },
      select: { type: true },
    });

    await this.prisma.wandererReaction.upsert({
      where: {
        viewerId_targetUserId: {
          viewerId,
          targetUserId,
        },
      },
      create: {
        viewerId,
        targetUserId,
        type: reactionType,
      },
      update: {
        type: reactionType,
      },
    });

    const becameFavorite =
      reactionType === WandererReactionType.FAVORITE &&
      previous?.type !== WandererReactionType.FAVORITE;

    if (becameFavorite) {
      const reverse = await this.prisma.wandererReaction.findUnique({
        where: {
          viewerId_targetUserId: {
            viewerId: targetUserId,
            targetUserId: viewerId,
          },
        },
        select: { type: true },
      });
      const isReturn = reverse?.type === WandererReactionType.FAVORITE;
      if (isReturn) {
        await this.notificationsService.notifyFavoriteReturned(viewerId, targetUserId);
      } else {
        await this.notificationsService.notifyFavoriteReceived(viewerId, targetUserId);
      }
      // Ensure both clients get fresh isFavorite / peerFavoritedMe even if
      // notification side-effects partially fail.
      await this.chatsService.syncFavoriteFlagsBetween(viewerId, targetUserId);
    }

    return { targetUserId, type };
  }

  async clearWandererReaction(viewerId: string, targetUserId: string): Promise<void> {
    const blockedByMe = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: { blockerId: viewerId, blockedId: targetUserId },
      },
      select: { id: true },
    });

    if (blockedByMe) {
      throw new BadRequestException('Сначала разблокируйте пользователя');
    }

    const existing = await this.prisma.wandererReaction.findUnique({
      where: {
        viewerId_targetUserId: {
          viewerId,
          targetUserId,
        },
      },
      select: { type: true },
    });

    await this.prisma.wandererReaction.deleteMany({
      where: {
        viewerId,
        targetUserId,
      },
    });

    if (existing?.type === WandererReactionType.FAVORITE) {
      // Chat system message only — no portal notification.
      await this.chatsService.postFavoriteRemovedMessage(viewerId, targetUserId);
      await this.chatsService.syncFavoriteFlagsBetween(viewerId, targetUserId);
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    if (dto.nickname) {
      const existing = await this.prisma.user.findFirst({
        where: {
          nickname: dto.nickname.trim(),
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Этот никнейм уже занят');
      }
    }

    if (dto.statusIds) {
      await this.assertStatusesExist(dto.statusIds);
    }

    if (dto.experienceTypeIds) {
      await this.assertExperienceTypesExist(dto.experienceTypeIds);
    }

    let resolvedSystems: string[] | undefined;

    if (dto.systems) {
      const catalog = await this.prisma.gameSystem.findMany({
        select: { name: true },
      });

      resolvedSystems = resolveGameSystemNames(
        dto.systems,
        catalog.map((item) => item.name),
      );

      await this.syncUserGameSystemsFromResolvedNames(userId, resolvedSystems, catalog);
    }

    let cityUpdate:
      | {
          cityId: string | null;
          location: string | null;
        }
      | undefined;
    let cityIdsToSync: string[] | undefined;

    if (dto.cityIds !== undefined) {
      const uniqueIds = [...new Set(dto.cityIds.map((id) => id.trim()).filter(Boolean))];

      if (uniqueIds.length > 3) {
        throw new BadRequestException('Можно указать не больше 3 городов');
      }

      const cities = uniqueIds.length
        ? await this.prisma.city.findMany({
            where: { id: { in: uniqueIds }, isActive: true },
            select: { id: true, name: true },
          })
        : [];

      if (cities.length !== uniqueIds.length) {
        throw new BadRequestException('Один или несколько городов не найдены');
      }

      const cityById = new Map(cities.map((city) => [city.id, city]));
      const ordered = uniqueIds
        .map((id) => cityById.get(id))
        .filter((city): city is { id: string; name: string } => Boolean(city));

      cityIdsToSync = ordered.map((city) => city.id);
      cityUpdate = {
        cityId: ordered[0]?.id ?? null,
        location: ordered.map((city) => city.name).join(' · ') || null,
      };
    } else if (dto.cityId !== undefined) {
      if (dto.cityId === null) {
        cityIdsToSync = [];
        cityUpdate = {
          cityId: null,
          location: null,
        };
      } else {
        const city = await this.getActiveCity(dto.cityId);
        cityIdsToSync = [city.id];
        cityUpdate = {
          cityId: city.id,
          location: city.name,
        };
      }
    }

    if (cityIdsToSync !== undefined) {
      await this.prisma.userCity.deleteMany({ where: { userId } });

      if (cityIdsToSync.length > 0) {
        await this.prisma.userCity.createMany({
          data: cityIdsToSync.map((cityId, index) => ({
            userId,
            cityId,
            sortOrder: index,
          })),
        });
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname?.trim(),
        availability: dto.availability?.trim(),
        age: dto.age,
        playsOnline: dto.playsOnline,
        timezone: dto.timezone?.trim(),
        isPublic: dto.isPublic,
        systems: resolvedSystems,
        readyToLearnNew: dto.readyToLearnNew,
        openToAnySystem: dto.openToAnySystem,
        about: dto.about !== undefined ? dto.about.trim() || null : undefined,
        description:
          dto.description !== undefined && dto.description !== null
            ? dto.description.trim() || null
            : undefined,
        roles: dto.roles,
        questionnaireStep: dto.questionnaireStep,
        ...(cityUpdate ?? {}),
        ...(dto.statusIds !== undefined
          ? {
              statuses: {
                deleteMany: {},
                create: dto.statusIds.map((statusId) => ({ statusId })),
              },
            }
          : {}),
        ...(dto.experienceTypeIds !== undefined
          ? {
              experiences: {
                deleteMany: {},
                create: dto.experienceTypeIds.map((experienceTypeId) => ({
                  experienceTypeId,
                })),
              },
            }
          : {}),
      },
      select: USER_PROFILE_SELECT,
    });

    return this.toProfile(user);
  }

  async uploadAvatar(userId: string, file?: Express.Multer.File): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }

    const variants = await this.imageProcessor.processImage(
      file.buffer,
      file.mimetype,
    );

    await this.mediaService.replaceCollection(
      {
        entityType: USER_ENTITY_TYPE,
        entityId: userId,
        collection: AVATAR_COLLECTION,
      },
      variants,
    );

    await this.touchUserMediaUpdatedAt(userId);

    return this.getProfile(userId);
  }

  async deleteAvatar(userId: string): Promise<UserProfile> {
    await this.mediaService.deleteCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: AVATAR_COLLECTION,
    });

    await this.touchUserMediaUpdatedAt(userId);

    return this.getProfile(userId);
  }

  async uploadProfileCard(
    userId: string,
    file?: Express.Multer.File,
  ): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }

    const variants = await this.imageProcessor.processImage(
      file.buffer,
      file.mimetype,
      ['cardThumb', 'card', 'original'],
    );

    await this.mediaService.replaceCollection(
      {
        entityType: USER_ENTITY_TYPE,
        entityId: userId,
        collection: PROFILE_CARD_COLLECTION,
      },
      variants,
    );

    await this.touchUserMediaUpdatedAt(userId);

    return this.getProfile(userId);
  }

  async deleteProfileCard(userId: string): Promise<UserProfile> {
    await this.mediaService.deleteCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: PROFILE_CARD_COLLECTION,
    });

    await this.touchUserMediaUpdatedAt(userId);

    return this.getProfile(userId);
  }

  async deleteQuestionnaire(userId: string): Promise<UserProfile> {
    await this.mediaService.deleteCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: PROFILE_CARD_COLLECTION,
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        about: null,
        description: null,
        age: null,
        availability: null,
        cityId: null,
        location: null,
        playsOnline: false,
        timezone: 'Europe/Moscow',
        isPublic: false,
        systems: [],
        readyToLearnNew: false,
        openToAnySystem: false,
        roles: [],
        questionnaireStep: 0,
        statuses: {
          deleteMany: {},
        },
        experiences: {
          deleteMany: {},
        },
        userCities: {
          deleteMany: {},
        },
      },
      select: USER_PROFILE_SELECT,
    });

    return this.toProfile(user);
  }

  private async assertStatusesExist(statusIds: string[]) {
    const uniqueIds = [...new Set(statusIds)];
    const count = await this.prisma.status.count({
      where: { id: { in: uniqueIds } },
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException('Один или несколько статусов не найдены');
    }
  }

  private async assertExperienceTypesExist(experienceTypeIds: string[]) {
    const uniqueIds = [...new Set(experienceTypeIds)];
    const count = await this.prisma.experienceType.count({
      where: { id: { in: uniqueIds } },
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException('Один или несколько видов опыта не найдены');
    }
  }

  private async syncUserGameSystemsFromResolvedNames(
    userId: string,
    systemNames: string[],
    catalog: { name: string }[],
  ): Promise<void> {
    const catalogNormalized = new Set(catalog.map((item) => normalizeGameSystemName(item.name)));

    for (const systemName of systemNames) {
      if (catalogNormalized.has(normalizeGameSystemName(systemName))) {
        continue;
      }

      await this.prisma.userGameSystem.upsert({
        where: {
          userId_normalizedName: {
            userId,
            normalizedName: normalizeGameSystemName(systemName),
          },
        },
        create: {
          userId,
          name: systemName,
          normalizedName: normalizeGameSystemName(systemName),
        },
        update: {
          name: systemName,
        },
      });
    }
  }

  private async getActiveCity(cityId: string) {
    const city = await this.prisma.city.findFirst({
      where: {
        id: cityId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!city) {
      throw new BadRequestException('Город не найден');
    }

    return city;
  }

  private async touchUserMediaUpdatedAt(userId: string) {
    // Object key stays the same — bump updatedAt so client cache refreshes

    await this.prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
  }

  private mapProfileCities(user: UserWithRelations): UserProfile['cities'] {
    if (user.userCities.length > 0) {
      return user.userCities.map((item) => ({
        id: item.city.id,
        name: item.city.name,
        region: item.city.region,
        countryCode: item.city.country.code,
        countryName: item.city.country.name,
      }));
    }

    if (user.city) {
      return [
        {
          id: user.city.id,
          name: user.city.name,
          region: user.city.region,
          countryCode: user.city.country.code,
          countryName: user.city.country.name,
        },
      ];
    }

    return [];
  }

  private async toProfile(user: UserWithRelations): Promise<UserProfile> {
    const avatarMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: user.id,
      collection: AVATAR_COLLECTION,
    });

    const profileCardMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: user.id,
      collection: PROFILE_CARD_COLLECTION,
    });

    const avatarUrls = await this.mediaService.getCollectionUrls(avatarMedia);
    const profileCardUrls = await this.mediaService.getCollectionUrls(profileCardMedia);
    const hasProfileCard = Object.keys(profileCardUrls).length > 0;
    const cities = this.mapProfileCities(user);

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      statuses: user.statuses.map((item) => item.status),
      experienceTypes: user.experiences.map((item) => item.experienceType),
      availability: user.availability,
      age: user.age,
      city: cities[0] ?? null,
      cities,
      location:
        cities.length > 0 ? cities.map((city) => city.name).join(' · ') : user.location,
      playsOnline: user.playsOnline,
      timezone: user.timezone || 'Europe/Moscow',
      isPublic: user.isPublic,
      systems: user.systems,
      readyToLearnNew: user.readyToLearnNew,
      openToAnySystem: user.openToAnySystem,
      about: user.about,
      description: user.description,
      roles: user.roles,
      questionnaireStep: user.questionnaireStep,
      questionnaireCompletionPercent: calculateQuestionnaireCompletionPercent(
        buildQuestionnaireCompletionInput(user, hasProfileCard),
      ),
      avatar: Object.keys(avatarUrls).length > 0 ? avatarUrls : null,
      profileCard: hasProfileCard ? profileCardUrls : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async toWandererCard(
    user: UserWithRelations,
    options?: { blockedByMe?: boolean; includeIncomplete?: boolean },
  ): Promise<WandererCard | null> {
    const profileCardMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: user.id,
      collection: PROFILE_CARD_COLLECTION,
    });
    const profileCardUrls = await this.mediaService.getCollectionUrls(profileCardMedia);
    const hasProfileCard = Object.keys(profileCardUrls).length > 0;
    const completionInput = buildQuestionnaireCompletionInput(user, hasProfileCard);

    if (!options?.includeIncomplete && !isEligibleForWanderersFeed(completionInput)) {
      return null;
    }

    const cities = this.mapProfileCities(user);
    const cityNames = cities.map((city) => city.name);

    return {
      id: user.id,
      nickname: user.nickname,
      age: user.age,
      tagline: user.statuses[0]?.status.name ?? user.about,
      roles: user.roles,
      availability: user.availability,
      timezone: user.timezone || 'Europe/Moscow',
      systems: user.systems,
      readyToLearnNew: user.readyToLearnNew,
      openToAnySystem: user.openToAnySystem,
      about: user.description ?? user.about,
      description: user.description,
      location: cityNames.length > 0 ? cityNames.join(' · ') : user.location,
      cities: cityNames,
      playsOnline: user.playsOnline,
      experienceLabel: user.experiences[0]?.experienceType.name ?? null,
      profileCard: hasProfileCard ? profileCardUrls : null,
      blockedByMe: options?.blockedByMe ?? false,
    };
  }
}
