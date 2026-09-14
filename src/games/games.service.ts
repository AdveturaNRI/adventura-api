import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  GameApplicationStatus,
  GameKind,
  GameStatus,
  type Prisma,
} from '@prisma/client';

import { ChatsService } from '../chats/chats.service';
import {
  MAX_GAME_SYSTEM_NAME_LENGTH,
  normalizeGameSystemName,
} from '../common/utils/game-system-name.utils';
import {
  endOfZonedIsoDate,
  getZonedDateTimeParts,
  normalizeTimezone,
  startOfZonedIsoDate,
  wallTimeToUtcDate,
} from '../common/utils/timezone.utils';
import { ImageProcessorService } from '../image/image-processor.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyGameDto } from './dto/apply-game.dto';
import { CreateGameDto, CreateGameKindDto } from './dto/create-game.dto';
import { ListGamesFeedQueryDto } from './dto/list-games-feed.dto';
import {
  UpdateGameStatusDto,
  UpdateGameStatusDtoEnum,
} from './dto/update-game-status.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import type {
  GameListItem,
  GameManagePayload,
  GamePersonItem,
  GameViewerRelation,
} from './types/game.type';

const GAME_ENTITY_TYPE = 'Game';
const COVER_COLLECTION = 'cover';
const USER_ENTITY_TYPE = 'User';
const AVATAR_COLLECTION = 'avatar';

const GAME_SELECT = {
  id: true,
  title: true,
  description: true,
  maxPlayers: true,
  durationHours: true,
  kind: true,
  status: true,
  isOnline: true,
  scheduledAt: true,
  timezone: true,
  priceRub: true,
  beginnersWelcome: true,
  minAge: true,
  createdAt: true,
  updatedAt: true,
  city: {
    select: {
      id: true,
      name: true,
      region: true,
    },
  },
  experienceType: {
    select: {
      id: true,
      name: true,
    },
  },
  userGameSystem: {
    select: {
      name: true,
    },
  },
  _count: {
    select: {
      players: true,
      applications: {
        where: { status: GameApplicationStatus.PENDING },
      },
    },
  },
} as const;

type GameRow = {
  id: string;
  title: string;
  description: string | null;
  maxPlayers: number;
  durationHours: number | null;
  kind: GameKind;
  status: GameStatus;
  isOnline: boolean;
  scheduledAt: Date | null;
  timezone: string;
  priceRub: number | null;
  beginnersWelcome: boolean;
  minAge: number | null;
  createdAt: Date;
  updatedAt: Date;
  city: { id: string; name: string; region: string | null } | null;
  experienceType: { id: string; name: string } | null;
  userGameSystem: { name: string };
  _count: { players: number; applications: number };
};

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly chatsService: ChatsService,
  ) {}

  async listMine(ownerId: string): Promise<GameListItem[]> {
    const games = await this.prisma.game.findMany({
      where: { ownerId },
      select: GAME_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return Promise.all(
      games.map((game) => this.toListItem(game, { viewerRelation: 'owner' })),
    );
  }

  async listFeed(
    viewerId: string,
    query: ListGamesFeedQueryDto = {},
  ): Promise<GameListItem[]> {
    const feedStatus =
      query.status === 'CLOSED' ? GameStatus.CLOSED : GameStatus.RECRUITING;

    const blockRows = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const excludedOwnerIds = new Set<string>();
    for (const row of blockRows) {
      excludedOwnerIds.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }

    const where: Prisma.GameWhereInput = {
      status: feedStatus,
      ...(excludedOwnerIds.size > 0
        ? { ownerId: { notIn: [...excludedOwnerIds] } }
        : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { owner: { nickname: { contains: q, mode: 'insensitive' } } },
        { userGameSystem: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (query.kind === 'ONESHOT' || query.kind === 'CAMPAIGN') {
      where.kind = query.kind;
    }

    if (typeof query.isOnline === 'boolean') {
      where.isOnline = query.isOnline;
      if (query.isOnline === false) {
        const cityIds = this.parseCityIdsFilter(query.cityIds, query.cityId);
        if (cityIds.length === 1) {
          where.cityId = cityIds[0];
        } else if (cityIds.length > 1) {
          where.cityId = { in: cityIds };
        }
      }
    } else {
      const cityIds = this.parseCityIdsFilter(query.cityIds, query.cityId);
      if (cityIds.length === 1) {
        where.cityId = cityIds[0];
      } else if (cityIds.length > 1) {
        where.cityId = { in: cityIds };
      }
    }

    const system = query.system?.trim();
    if (system) {
      where.userGameSystem = {
        name: {
          contains: system,
          mode: 'insensitive',
        },
      };
    }

    if (typeof query.isFree === 'boolean') {
      where.priceRub = query.isFree ? null : { not: null };
    }

    if (typeof query.beginnersWelcome === 'boolean') {
      where.beginnersWelcome = query.beginnersWelcome;
    }

    if (query.age === 'any') {
      where.minAge = null;
    } else if (query.age === '12' || query.age === '16' || query.age === '18') {
      where.minAge = Number(query.age);
    }

    const schedulePreset = query.schedulePreset;
    const scheduledFrom = query.scheduledFrom?.trim();
    const scheduledTo = query.scheduledTo?.trim();
    const viewerTimezone = await this.resolveViewerTimezone(
      viewerId,
      query.timezone,
    );
    const viewerNow = this.nowInTimezone(viewerTimezone);

    if (schedulePreset === 'upcoming') {
      // Без даты = текущие; с датой — ещё не начались «сейчас» в поясе зрителя
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { scheduledAt: null },
            { scheduledAt: { gte: viewerNow } },
          ],
        },
      ];
    } else if (schedulePreset === 'past') {
      where.scheduledAt = { not: null, lt: viewerNow };
    } else if (scheduledFrom || scheduledTo) {
      const range: { gte?: Date; lte?: Date; not?: null } = { not: null };
      if (scheduledFrom) {
        const from = startOfZonedIsoDate(scheduledFrom, viewerTimezone);
        if (from) {
          range.gte = from;
        }
      }
      if (scheduledTo) {
        const to = endOfZonedIsoDate(scheduledTo, viewerTimezone);
        if (to) {
          range.lte = to;
        }
      }
      where.scheduledAt = range;
    }

    const games = await this.prisma.game.findMany({
      where,
      select: {
        ...GAME_SELECT,
        ownerId: true,
        owner: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    const withSeats =
      query.hasSeats === true
        ? games.filter((game) => game._count.players < game.maxPlayers)
        : games;

    const gameIds = withSeats.map((game) => game.id);
    const [myApplications, myPlayers] =
      gameIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.gameApplication.findMany({
              where: { userId: viewerId, gameId: { in: gameIds } },
              select: { gameId: true, status: true },
            }),
            this.prisma.gamePlayer.findMany({
              where: { userId: viewerId, gameId: { in: gameIds } },
              select: { gameId: true },
            }),
          ]);

    const applicationByGameId = new Map(
      myApplications.map((item) => [item.gameId, item.status]),
    );
    const playerGameIds = new Set(myPlayers.map((item) => item.gameId));

    const withSchedule = withSeats
      .filter((game) => game.scheduledAt != null)
      .sort((a, b) => {
        const aTime = a.scheduledAt!.getTime();
        const bTime = b.scheduledAt!.getTime();
        if (aTime !== bTime) {
          return aTime - bTime;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    const withoutSchedule = withSeats
      .filter((game) => game.scheduledAt == null)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return Promise.all(
      [...withSchedule, ...withoutSchedule].slice(0, 100).map((game) => {
        let viewerRelation: GameViewerRelation = 'none';
        if (game.ownerId === viewerId) {
          viewerRelation = 'owner';
        } else if (playerGameIds.has(game.id)) {
          viewerRelation = 'player';
        } else {
          const appStatus = applicationByGameId.get(game.id);
          if (appStatus === GameApplicationStatus.PENDING) {
            viewerRelation = 'pending';
          } else if (appStatus === GameApplicationStatus.REJECTED) {
            viewerRelation = 'rejected';
          }
        }

        return this.toListItem(game, {
          owner: game.owner,
          hidePendingCount: true,
          viewerRelation,
        });
      }),
    );
  }

  async apply(
    viewerId: string,
    gameId: string,
    dto: ApplyGameDto = {},
  ): Promise<GameListItem> {
    const message = dto.message?.trim() || null;
    if (message && message.length > 1000) {
      throw new BadRequestException('Сообщение слишком длинное');
    }

    const game = await this.prisma.game.findFirst({
      where: { id: gameId },
      select: {
        ...GAME_SELECT,
        ownerId: true,
        owner: { select: { id: true, nickname: true } },
      },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    if (game.ownerId === viewerId) {
      throw new BadRequestException('Нельзя подать заявку на свой стол');
    }

    if (game.status !== GameStatus.RECRUITING) {
      throw new BadRequestException('Набор на эту игру закрыт');
    }

    if (game._count.players >= game.maxPlayers) {
      throw new BadRequestException('Мест больше нет');
    }

    const alreadyPlayer = await this.prisma.gamePlayer.findUnique({
      where: { gameId_userId: { gameId, userId: viewerId } },
      select: { id: true },
    });

    if (alreadyPlayer) {
      throw new BadRequestException('Вы уже в составе этой игры');
    }

    const existing = await this.prisma.gameApplication.findUnique({
      where: { gameId_userId: { gameId, userId: viewerId } },
      select: { id: true, status: true },
    });

    if (existing?.status === GameApplicationStatus.PENDING) {
      throw new BadRequestException('Заявка уже отправлена');
    }

    if (existing?.status === GameApplicationStatus.ACCEPTED) {
      const stillInRoster = await this.prisma.gamePlayer.findUnique({
        where: { gameId_userId: { gameId, userId: viewerId } },
        select: { id: true },
      });
      if (stillInRoster) {
        throw new BadRequestException('Вас уже приняли за этот стол');
      }
    }

    if (existing) {
      await this.prisma.gameApplication.update({
        where: { id: existing.id },
        data: {
          status: GameApplicationStatus.PENDING,
          message,
        },
      });
    } else {
      await this.prisma.gameApplication.create({
        data: {
          gameId,
          userId: viewerId,
          status: GameApplicationStatus.PENDING,
          message,
        },
      });
    }

    await this.notificationsService.notifyGameApplication(viewerId, game.ownerId, {
      id: game.id,
      title: game.title,
    });

    return this.toListItem(game, {
      owner: game.owner,
      hidePendingCount: true,
      viewerRelation: 'pending',
    });
  }

  async cancelApplication(viewerId: string, gameId: string): Promise<GameListItem> {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId },
      select: {
        ...GAME_SELECT,
        ownerId: true,
        owner: { select: { id: true, nickname: true } },
      },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    const application = await this.prisma.gameApplication.findUnique({
      where: { gameId_userId: { gameId, userId: viewerId } },
      select: { id: true, status: true },
    });

    if (!application || application.status !== GameApplicationStatus.PENDING) {
      throw new BadRequestException('Активной заявки нет');
    }

    await this.prisma.gameApplication.delete({
      where: { id: application.id },
    });

    return this.toListItem(game, {
      owner: game.owner,
      hidePendingCount: true,
      viewerRelation: game.ownerId === viewerId ? 'owner' : 'none',
    });
  }

  async create(ownerId: string, dto: CreateGameDto): Promise<GameListItem> {
    this.assertLocation(dto);
    this.assertPrice(dto);
    this.assertExperience(dto);
    this.assertAge(dto);

    const scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    const userGameSystemId = await this.resolveUserGameSystem(ownerId, dto.systemName);

    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({
        where: { id: dto.cityId, isActive: true },
        select: { id: true },
      });
      if (!city) {
        throw new BadRequestException('Город не найден');
      }
    }

    if (dto.experienceTypeId) {
      const experience = await this.prisma.experienceType.findUnique({
        where: { id: dto.experienceTypeId },
        select: { id: true },
      });
      if (!experience) {
        throw new BadRequestException('Тип опыта не найден');
      }
    }

    const created = await this.prisma.game.create({
      data: {
        ownerId,
        userGameSystemId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        maxPlayers: dto.maxPlayers,
        durationHours: dto.durationHours ?? null,
        kind: dto.kind === CreateGameKindDto.CAMPAIGN ? GameKind.CAMPAIGN : GameKind.ONESHOT,
        status: GameStatus.RECRUITING,
        isOnline: dto.isOnline,
        cityId: dto.isOnline ? null : dto.cityId || null,
        scheduledAt,
        timezone: dto.timezone?.trim() || 'Europe/Moscow',
        priceRub: dto.isFree ? null : dto.priceRub ?? null,
        experienceTypeId: dto.beginnersWelcome ? null : dto.experienceTypeId || null,
        beginnersWelcome: dto.beginnersWelcome,
        minAge: dto.anyAge ? null : dto.minAge ?? null,
      },
      select: GAME_SELECT,
    });

    return this.toListItem(created);
  }

  async getOwnedGame(ownerId: string, gameId: string): Promise<GameListItem> {
    return this.getOwned(ownerId, gameId);
  }

  async getForViewer(viewerId: string, gameId: string): Promise<GameListItem> {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId },
      select: {
        ...GAME_SELECT,
        ownerId: true,
        owner: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    const viewerRelation = await this.resolveViewerRelation(
      viewerId,
      game.id,
      game.ownerId,
    );

    return this.toListItem(game, {
      owner: game.owner,
      hidePendingCount: viewerRelation !== 'owner',
      viewerRelation,
    });
  }

  async getManage(ownerId: string, gameId: string): Promise<GameManagePayload> {
    const game = await this.getOwned(ownerId, gameId);

    const [applications, players] = await Promise.all([
      this.prisma.gameApplication.findMany({
        where: { gameId, status: GameApplicationStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
          message: true,
          user: {
            select: {
              id: true,
              nickname: true,
              age: true,
              about: true,
              description: true,
            },
          },
        },
      }),
      this.prisma.gamePlayer.findMany({
        where: { gameId },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              nickname: true,
              age: true,
              about: true,
              description: true,
            },
          },
        },
      }),
    ]);

    return {
      game,
      applications: await Promise.all(
        applications.map((item) =>
          this.toPersonItem({
            id: item.id,
            createdAt: item.createdAt,
            message: item.message,
            user: item.user,
          }),
        ),
      ),
      players: await Promise.all(
        players.map((item) =>
          this.toPersonItem({
            id: item.id,
            createdAt: item.joinedAt,
            message: null,
            user: item.user,
          }),
        ),
      ),
    };
  }

  async updateStatus(
    ownerId: string,
    gameId: string,
    dto: UpdateGameStatusDto,
  ): Promise<GameManagePayload> {
    await this.requireOwnedGame(ownerId, gameId);

    const nextStatus = this.mapStatus(dto.status);
    const current = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: { status: true },
    });

    if (!current) {
      throw new NotFoundException('Игра не найдена');
    }

    if (current.status === GameStatus.FINISHED && nextStatus !== GameStatus.FINISHED) {
      throw new BadRequestException('Завершённую игру нельзя вернуть в набор');
    }

    await this.prisma.game.update({
      where: { id: gameId },
      data: { status: nextStatus },
    });

    return this.getManage(ownerId, gameId);
  }

  async acceptApplication(
    ownerId: string,
    gameId: string,
    applicationId: string,
  ): Promise<GameManagePayload> {
    await this.requireOwnedGame(ownerId, gameId);

    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: {
        id: true,
        title: true,
        status: true,
        maxPlayers: true,
        _count: { select: { players: true } },
      },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    if (game.status === GameStatus.FINISHED) {
      throw new BadRequestException('Игра уже завершена');
    }

    if (game._count.players >= game.maxPlayers) {
      throw new BadRequestException('Мест больше нет');
    }

    const application = await this.prisma.gameApplication.findFirst({
      where: {
        id: applicationId,
        gameId,
        status: GameApplicationStatus.PENDING,
      },
      select: { id: true, userId: true },
    });

    if (!application) {
      throw new NotFoundException('Заявка не найдена');
    }

    const alreadyPlayer = await this.prisma.gamePlayer.findUnique({
      where: {
        gameId_userId: { gameId, userId: application.userId },
      },
      select: { id: true },
    });

    if (alreadyPlayer) {
      await this.prisma.gameApplication.update({
        where: { id: application.id },
        data: { status: GameApplicationStatus.ACCEPTED },
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.gameApplication.update({
          where: { id: application.id },
          data: { status: GameApplicationStatus.ACCEPTED },
        }),
        this.prisma.gamePlayer.create({
          data: {
            gameId,
            userId: application.userId,
          },
        }),
      ]);
    }

    await this.notificationsService.notifyGameApplicationAccepted(ownerId, application.userId, {
      id: game.id,
      title: game.title,
    });

    await this.chatsService.addGameChatParticipant(gameId, application.userId);

    return this.getManage(ownerId, gameId);
  }

  async rejectApplication(
    ownerId: string,
    gameId: string,
    applicationId: string,
  ): Promise<GameManagePayload> {
    await this.requireOwnedGame(ownerId, gameId);

    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: { id: true, title: true },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    const application = await this.prisma.gameApplication.findFirst({
      where: {
        id: applicationId,
        gameId,
        status: GameApplicationStatus.PENDING,
      },
      select: { id: true, userId: true },
    });

    if (!application) {
      throw new NotFoundException('Заявка не найдена');
    }

    await this.prisma.gameApplication.update({
      where: { id: application.id },
      data: { status: GameApplicationStatus.REJECTED },
    });

    await this.notificationsService.notifyGameApplicationRejected(ownerId, application.userId, {
      id: game.id,
      title: game.title,
    });

    return this.getManage(ownerId, gameId);
  }

  async removePlayer(
    ownerId: string,
    gameId: string,
    userId: string,
  ): Promise<GameManagePayload> {
    await this.requireOwnedGame(ownerId, gameId);

    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: { id: true, title: true },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    const player = await this.prisma.gamePlayer.findUnique({
      where: {
        gameId_userId: { gameId, userId },
      },
      select: { id: true },
    });

    if (!player) {
      throw new NotFoundException('Игрок не найден');
    }

    await this.prisma.$transaction([
      this.prisma.gamePlayer.delete({
        where: { id: player.id },
      }),
      this.prisma.gameApplication.updateMany({
        where: {
          gameId,
          userId,
          status: {
            in: [GameApplicationStatus.ACCEPTED, GameApplicationStatus.PENDING],
          },
        },
        data: { status: GameApplicationStatus.REJECTED },
      }),
    ]);

    await this.notificationsService.notifyGamePlayerRemoved(ownerId, userId, {
      id: game.id,
      title: game.title,
    });

    await this.chatsService.removeGameChatParticipant(gameId, userId);

    return this.getManage(ownerId, gameId);
  }

  async update(ownerId: string, gameId: string, dto: UpdateGameDto): Promise<GameListItem> {
    await this.requireOwnedGame(ownerId, gameId);

    this.assertLocation(dto);
    this.assertPrice(dto);
    this.assertExperience(dto);
    this.assertAge(dto);

    const scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    const userGameSystemId = await this.resolveUserGameSystem(ownerId, dto.systemName);

    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({
        where: { id: dto.cityId, isActive: true },
        select: { id: true },
      });
      if (!city) {
        throw new BadRequestException('Город не найден');
      }
    }

    if (dto.experienceTypeId) {
      const experience = await this.prisma.experienceType.findUnique({
        where: { id: dto.experienceTypeId },
        select: { id: true },
      });
      if (!experience) {
        throw new BadRequestException('Тип опыта не найден');
      }
    }

    const updated = await this.prisma.game.update({
      where: { id: gameId },
      data: {
        userGameSystemId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        maxPlayers: dto.maxPlayers,
        durationHours: dto.durationHours ?? null,
        kind: dto.kind === CreateGameKindDto.CAMPAIGN ? GameKind.CAMPAIGN : GameKind.ONESHOT,
        isOnline: dto.isOnline,
        cityId: dto.isOnline ? null : dto.cityId || null,
        scheduledAt,
        timezone: dto.timezone?.trim() || 'Europe/Moscow',
        priceRub: dto.isFree ? null : dto.priceRub ?? null,
        experienceTypeId: dto.beginnersWelcome ? null : dto.experienceTypeId || null,
        beginnersWelcome: dto.beginnersWelcome,
        minAge: dto.anyAge ? null : dto.minAge ?? null,
      },
      select: GAME_SELECT,
    });

    await this.chatsService.renameGameChat(gameId, updated.title);

    return this.toListItem(updated);
  }

  async uploadCover(ownerId: string, gameId: string, file?: Express.Multer.File) {
    await this.requireOwnedGame(ownerId, gameId);

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
        entityType: GAME_ENTITY_TYPE,
        entityId: gameId,
        collection: COVER_COLLECTION,
      },
      variants,
    );

    await this.prisma.game.update({
      where: { id: gameId },
      data: { updatedAt: new Date() },
    });

    return this.getOwned(ownerId, gameId);
  }

  async deleteCover(ownerId: string, gameId: string) {
    await this.requireOwnedGame(ownerId, gameId);
    await this.mediaService.deleteCollection({
      entityType: GAME_ENTITY_TYPE,
      entityId: gameId,
      collection: COVER_COLLECTION,
    });

    await this.prisma.game.update({
      where: { id: gameId },
      data: { updatedAt: new Date() },
    });

    return this.getOwned(ownerId, gameId);
  }

  private mapStatus(status: UpdateGameStatusDtoEnum): GameStatus {
    if (status === UpdateGameStatusDtoEnum.CLOSED) {
      return GameStatus.CLOSED;
    }
    if (status === UpdateGameStatusDtoEnum.FINISHED) {
      return GameStatus.FINISHED;
    }
    return GameStatus.RECRUITING;
  }

  private async getOwned(ownerId: string, gameId: string): Promise<GameListItem> {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: GAME_SELECT,
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    return this.toListItem(game, { viewerRelation: 'owner' });
  }

  private async resolveViewerRelation(
    viewerId: string,
    gameId: string,
    ownerId: string,
  ): Promise<GameViewerRelation> {
    if (ownerId === viewerId) {
      return 'owner';
    }

    const player = await this.prisma.gamePlayer.findUnique({
      where: { gameId_userId: { gameId, userId: viewerId } },
      select: { id: true },
    });

    if (player) {
      return 'player';
    }

    const application = await this.prisma.gameApplication.findUnique({
      where: { gameId_userId: { gameId, userId: viewerId } },
      select: { status: true },
    });

    if (application?.status === GameApplicationStatus.PENDING) {
      return 'pending';
    }

    if (application?.status === GameApplicationStatus.REJECTED) {
      return 'rejected';
    }

    return 'none';
  }

  private async requireOwnedGame(ownerId: string, gameId: string) {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId },
      select: { id: true },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }
  }

  private async resolveUserGameSystem(ownerId: string, rawName: string): Promise<string> {
    const name = rawName.trim();

    if (!name || name.length > MAX_GAME_SYSTEM_NAME_LENGTH) {
      throw new BadRequestException('Укажите систему игры');
    }

    const normalizedName = normalizeGameSystemName(name);

    const existing = await this.prisma.userGameSystem.findUnique({
      where: {
        userId_normalizedName: {
          userId: ownerId,
          normalizedName,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const official = await this.prisma.gameSystem.findFirst({
      where: {
        OR: [{ name }, { name: { equals: name, mode: 'insensitive' } }],
      },
      select: { name: true },
    });

    const created = await this.prisma.userGameSystem.create({
      data: {
        userId: ownerId,
        name: official?.name ?? name,
        normalizedName,
      },
      select: { id: true },
    });

    return created.id;
  }

  private assertLocation(dto: CreateGameDto) {
    if (!dto.isOnline && !dto.cityId) {
      throw new BadRequestException('Укажите город или отметьте онлайн-игру');
    }
  }

  private assertPrice(dto: CreateGameDto) {
    if (!dto.isFree && (dto.priceRub == null || dto.priceRub < 0)) {
      throw new BadRequestException('Укажите стоимость или отметьте бесплатную игру');
    }
  }

  private assertExperience(dto: CreateGameDto) {
    if (!dto.beginnersWelcome && !dto.experienceTypeId) {
      throw new BadRequestException('Укажите опыт или отметьте «Можно новичкам»');
    }
  }

  private assertAge(dto: CreateGameDto) {
    if (dto.anyAge) {
      return;
    }

    if (dto.minAge == null || ![12, 16, 18].includes(dto.minAge)) {
      throw new BadRequestException('Выберите возраст 12+, 16+ или 18+');
    }
  }

  private async resolveViewerTimezone(
    viewerId: string,
    hint?: string | null,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { timezone: true },
    });

    return normalizeTimezone(user?.timezone?.trim() || hint?.trim());
  }

  /**
   * «Сейчас» с точностью до минуты в поясе зрителя.
   * Нужно, чтобы граница Текущие/Прошедшие совпадала с часами из анкеты, а не с UTC-полуночью.
   */
  private nowInTimezone(timeZone: string, now = new Date()): Date {
    const parts = getZonedDateTimeParts(now, timeZone);
    if (!parts) {
      return now;
    }

    return wallTimeToUtcDate(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      timeZone,
    );
  }

  private parseCityIdsFilter(cityIds?: string, cityId?: string): string[] {
    const fromList = (cityIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const single = cityId?.trim();

    if (fromList.length > 0) {
      return [...new Set(fromList)];
    }

    return single ? [single] : [];
  }

  private parseScheduledAt(value?: string | null): Date | null {
    if (!value?.trim()) {
      return null;
    }

    const trimmed = value.trim();
    const match =
      /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);

    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const hour = match[4] != null ? Number(match[4]) : 12;
      const minute = match[5] != null ? Number(match[5]) : 0;
      const second = match[6] != null ? Number(match[6]) : 0;

      if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
      ) {
        throw new BadRequestException('Некорректное время');
      }

      const date = new Date(year, month - 1, day, hour, minute, second);

      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
      ) {
        throw new BadRequestException('Некорректная дата');
      }

      return date;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректная дата');
    }

    return parsed;
  }

  private async toPersonItem(item: {
    id: string;
    createdAt: Date;
    message?: string | null;
    user: {
      id: string;
      nickname: string;
      age: number | null;
      about: string | null;
      description: string | null;
    };
  }): Promise<GamePersonItem> {
    return {
      id: item.id,
      userId: item.user.id,
      nickname: item.user.nickname,
      age: item.user.age,
      about: item.user.about?.trim() || item.user.description?.trim() || null,
      message: item.message?.trim() || null,
      avatarUrl: await this.getAvatarUrl(item.user.id),
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async getAvatarUrl(userId: string): Promise<string | null> {
    const media = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: AVATAR_COLLECTION,
    });
    const urls = await this.mediaService.getCollectionUrls(media);
    return urls.thumb ?? urls.small ?? urls.medium ?? urls.large ?? null;
  }

  private async toListItem(
    game: GameRow,
    options?: {
      owner?: { id: string; nickname: string } | null;
      hidePendingCount?: boolean;
      viewerRelation?: GameViewerRelation;
    },
  ): Promise<GameListItem> {
    const coverMedia = await this.mediaService.getCollection({
      entityType: GAME_ENTITY_TYPE,
      entityId: game.id,
      collection: COVER_COLLECTION,
    });

    const owner = options?.owner
      ? {
          id: options.owner.id,
          nickname: options.owner.nickname,
          avatarUrl: await this.getAvatarUrl(options.owner.id),
        }
      : null;

    return {
      id: game.id,
      title: game.title,
      description: game.description,
      maxPlayers: game.maxPlayers,
      durationHours: game.durationHours,
      kind: game.kind,
      status: game.status,
      isOnline: game.isOnline,
      city: game.city,
      scheduledAt: game.scheduledAt?.toISOString() ?? null,
      timezone: game.timezone || 'Europe/Moscow',
      priceRub: game.priceRub,
      isFree: game.priceRub == null,
      experienceTypeId: game.experienceType?.id ?? null,
      experienceLabel: game.experienceType?.name ?? null,
      beginnersWelcome: game.beginnersWelcome,
      minAge: game.minAge,
      anyAge: game.minAge == null,
      systemName: game.userGameSystem.name,
      cover:
        coverMedia.length > 0
          ? await this.mediaService.getCollectionUrls(coverMedia)
          : null,
      playersCount: game._count.players,
      pendingApplicationsCount: options?.hidePendingCount ? 0 : game._count.applications,
      owner,
      viewerRelation: options?.viewerRelation ?? 'none',
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
    };
  }
}
