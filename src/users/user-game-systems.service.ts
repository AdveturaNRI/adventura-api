import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  MAX_GAME_SYSTEM_NAME_LENGTH,
  normalizeGameSystemName,
} from '../common/utils/game-system-name.utils';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  UserGameSystemAuthor,
  UserGameSystemItem,
} from './types/user-game-system.type';

const USER_ENTITY_TYPE = 'User';
const AVATAR_COLLECTION = 'avatar';

type UserGameSystemRecord = {
  id: string;
  name: string;
  userId: string;
  user: {
    id: string;
    nickname: string;
  };
  _count: {
    games: number;
  };
};

@Injectable()
export class UserGameSystemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async listCommunity(currentUserId: string): Promise<UserGameSystemItem[]> {
    await this.syncFromProfileSystems(currentUserId);

    const catalogNormalized = (await this.getCatalogNames()).map(normalizeGameSystemName);

    if (catalogNormalized.length > 0) {
      await this.prisma.userGameSystem.deleteMany({
        where: {
          userId: currentUserId,
          normalizedName: { in: catalogNormalized },
          games: { none: {} },
        },
      });
    }

    const items = await this.prisma.userGameSystem.findMany({
      where:
        catalogNormalized.length > 0
          ? { normalizedName: { notIn: catalogNormalized } }
          : undefined,
      select: {
        id: true,
        name: true,
        userId: true,
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
        _count: {
          select: { games: true },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return Promise.all(
      items.map((item) => this.toItem(item, currentUserId)),
    );
  }

  async create(userId: string, rawName: string): Promise<UserGameSystemItem> {
    const name = await this.validateCustomName(userId, rawName);

    try {
      const created = await this.prisma.userGameSystem.create({
        data: {
          userId,
          name,
          normalizedName: normalizeGameSystemName(name),
        },
        select: {
          id: true,
          name: true,
          userId: true,
          user: {
            select: {
              id: true,
              nickname: true,
            },
          },
          _count: {
            select: { games: true },
          },
        },
      });

      return this.toItem(created, userId);
    } catch {
      throw new ConflictException('Такая система уже добавлена');
    }
  }

  async update(userId: string, id: string, rawName: string): Promise<UserGameSystemItem> {
    const existing = await this.getOwnedSystem(userId, id);

    if (existing._count.games > 0) {
      throw new BadRequestException('Нельзя изменить систему, по которой уже есть игры');
    }

    const name = await this.validateCustomName(userId, rawName, id);
    const previousName = existing.name;

    try {
      const updated = await this.prisma.userGameSystem.update({
        where: { id },
        data: {
          name,
          normalizedName: normalizeGameSystemName(name),
        },
        select: {
          id: true,
          name: true,
          userId: true,
          user: {
            select: {
              id: true,
              nickname: true,
            },
          },
          _count: {
            select: { games: true },
          },
        },
      });

      if (previousName !== name) {
        await this.replaceSystemNameInProfile(userId, previousName, name);
      }

      return this.toItem(updated, userId);
    } catch {
      throw new ConflictException('Такая система уже добавлена');
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getOwnedSystem(userId, id);

    if (existing._count.games > 0) {
      throw new BadRequestException('Нельзя удалить систему, по которой уже есть игры');
    }

    await this.prisma.userGameSystem.delete({
      where: { id },
    });

    await this.removeSystemNameFromProfile(userId, existing.name);
  }

  /**
   * Lift a community custom name into the official catalog and reattach users
   * who already used it (profile systems + game-linked rows).
   */
  async promoteToOfficial(
    rawName: string,
    options?: { description?: string | null },
  ): Promise<{
    gameSystemId: string;
    name: string;
    attachedUserIds: string[];
    attachedNicknames: string[];
    gamesRelinked: number;
    renamedForGames: number;
    removedEmptyCustoms: number;
  }> {
    const trimmed = rawName.trim();
    if (!trimmed) {
      throw new BadRequestException('Введите название системы');
    }
    if (trimmed.length > MAX_GAME_SYSTEM_NAME_LENGTH) {
      throw new BadRequestException('Слишком длинное название');
    }

    const normalized = normalizeGameSystemName(trimmed);
    const existingOfficial = await this.prisma.gameSystem.findFirst({
      where: {
        OR: [
          { name: trimmed },
          { name: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });

    const official =
      existingOfficial ??
      (await this.prisma.gameSystem.create({
        data: {
          name: trimmed,
          description: options?.description?.trim() || null,
          isOfficial: true,
          sortOrder: 100,
        },
      }));

    if (existingOfficial && !existingOfficial.isOfficial) {
      await this.prisma.gameSystem.update({
        where: { id: existingOfficial.id },
        data: {
          isOfficial: true,
          ...(options?.description !== undefined
            ? { description: options.description?.trim() || null }
            : {}),
        },
      });
    }

    const officialName = official.name;
    const officialNormalized = normalizeGameSystemName(officialName);

    const customRows = await this.prisma.userGameSystem.findMany({
      where: { normalizedName: officialNormalized },
      select: {
        id: true,
        userId: true,
        name: true,
        user: { select: { id: true, nickname: true, systems: true } },
        _count: { select: { games: true } },
      },
    });

    const profileUsers = await this.prisma.user.findMany({
      where: { systems: { isEmpty: false } },
      select: { id: true, nickname: true, systems: true },
    });

    const attachedById = new Map<string, string>();
    let renamedForGames = 0;
    let removedEmptyCustoms = 0;
    let gamesRelinked = 0;

    for (const row of customRows) {
      attachedById.set(row.user.id, row.user.nickname);
      const nextSystems = this.replaceSystemNameInList(
        row.user.systems,
        officialNormalized,
        officialName,
      );

      await this.prisma.user.update({
        where: { id: row.userId },
        data: { systems: nextSystems },
      });

      if (row._count.games > 0) {
        // Games keep the same UserGameSystem id (owner-scoped FK), but the
        // displayed/filterable name becomes the official catalog title.
        if (row.name !== officialName) {
          await this.prisma.userGameSystem.update({
            where: { id: row.id },
            data: { name: officialName },
          });
          renamedForGames += 1;
        }
        gamesRelinked += row._count.games;
      } else {
        await this.prisma.userGameSystem.delete({ where: { id: row.id } });
        removedEmptyCustoms += 1;
      }
    }

    for (const user of profileUsers) {
      const hasMatch = user.systems.some(
        (systemName) => normalizeGameSystemName(systemName) === officialNormalized,
      );
      if (!hasMatch) {
        continue;
      }
      attachedById.set(user.id, user.nickname);
      const nextSystems = this.replaceSystemNameInList(
        user.systems,
        officialNormalized,
        officialName,
      );
      if (nextSystems.join('\0') === user.systems.join('\0')) {
        continue;
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { systems: nextSystems },
      });
    }

    return {
      gameSystemId: official.id,
      name: officialName,
      attachedUserIds: [...attachedById.keys()],
      attachedNicknames: [...attachedById.values()].sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
      gamesRelinked,
      renamedForGames,
      removedEmptyCustoms,
    };
  }

  private replaceSystemNameInList(
    systems: string[],
    normalizedTarget: string,
    officialName: string,
  ): string[] {
    const next: string[] = [];
    let inserted = false;

    for (const systemName of systems) {
      if (normalizeGameSystemName(systemName) === normalizedTarget) {
        if (!inserted) {
          next.push(officialName);
          inserted = true;
        }
        continue;
      }
      next.push(systemName);
    }

    if (!inserted) {
      next.push(officialName);
    }

    return next;
  }

  async syncFromProfileSystems(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systems: true },
    });

    if (!user) {
      return;
    }

    const catalogNames = await this.getCatalogNames();
    const catalogNormalized = new Set(catalogNames.map(normalizeGameSystemName));

    for (const systemName of user.systems) {
      const trimmed = systemName.trim();

      if (!trimmed || catalogNormalized.has(normalizeGameSystemName(trimmed))) {
        continue;
      }

      await this.prisma.userGameSystem.upsert({
        where: {
          userId_normalizedName: {
            userId,
            normalizedName: normalizeGameSystemName(trimmed),
          },
        },
        create: {
          userId,
          name: trimmed,
          normalizedName: normalizeGameSystemName(trimmed),
        },
        update: {},
      });
    }
  }

  private async validateCustomName(
    userId: string,
    rawName: string,
    excludeId?: string,
  ): Promise<string> {
    const trimmed = rawName.trim();

    if (!trimmed) {
      throw new BadRequestException('Введите название системы');
    }

    if (trimmed.length > MAX_GAME_SYSTEM_NAME_LENGTH) {
      throw new BadRequestException('Слишком длинное название');
    }

    const normalized = normalizeGameSystemName(trimmed);
    const catalogNames = await this.getCatalogNames();
    const catalogMatch = catalogNames.find(
      (name) => normalizeGameSystemName(name) === normalized,
    );

    if (catalogMatch) {
      throw new BadRequestException(`Система «${catalogMatch}» уже есть в списке`);
    }

    const duplicate = await this.prisma.userGameSystem.findFirst({
      where: {
        userId,
        normalizedName: normalized,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Такая система уже добавлена');
    }

    return trimmed;
  }

  private async getOwnedSystem(userId: string, id: string) {
    const existing = await this.prisma.userGameSystem.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        _count: {
          select: { games: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Система не найдена');
    }

    return existing;
  }

  private async getCatalogNames(): Promise<string[]> {
    const catalog = await this.prisma.gameSystem.findMany({
      select: { name: true },
    });

    return catalog.map((item) => item.name);
  }

  private async replaceSystemNameInProfile(
    userId: string,
    previousName: string,
    nextName: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systems: true },
    });

    if (!user) {
      return;
    }

    const previousNormalized = normalizeGameSystemName(previousName);
    const nextSystems = user.systems.map((name) =>
      normalizeGameSystemName(name) === previousNormalized ? nextName : name,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { systems: nextSystems },
    });
  }

  private async removeSystemNameFromProfile(userId: string, name: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systems: true },
    });

    if (!user) {
      return;
    }

    const normalized = normalizeGameSystemName(name);
    const nextSystems = user.systems.filter(
      (systemName) => normalizeGameSystemName(systemName) !== normalized,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { systems: nextSystems },
    });
  }

  private async resolveAuthor(userId: string, nickname: string): Promise<UserGameSystemAuthor> {
    const avatarMedia = await this.mediaService.getCollection({
      entityType: USER_ENTITY_TYPE,
      entityId: userId,
      collection: AVATAR_COLLECTION,
    });
    const avatarUrls = await this.mediaService.getCollectionUrls(avatarMedia);
    const avatarUrl =
      avatarUrls.small ?? avatarUrls.thumb ?? avatarUrls.medium ?? avatarUrls.large ?? null;

    return {
      id: userId,
      nickname,
      avatarUrl,
    };
  }

  private async toItem(
    item: UserGameSystemRecord,
    currentUserId: string,
  ): Promise<UserGameSystemItem> {
    const gamesCount = item._count.games;
    const isOwner = item.userId === currentUserId;

    return {
      id: item.id,
      name: item.name,
      gamesCount,
      canEdit: isOwner && gamesCount === 0,
      canDelete: isOwner && gamesCount === 0,
      author: await this.resolveAuthor(item.user.id, item.user.nickname),
    };
  }
}
