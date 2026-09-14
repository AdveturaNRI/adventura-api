import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { ChatsService } from '../chats/chats.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';

export type NotificationDto = {
  id: string;
  type:
    | 'favorite_received'
    | 'favorite_returned'
    | 'game_application'
    | 'game_application_accepted'
    | 'game_application_rejected'
    | 'game_player_removed';
  actor: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  actionText: string;
  messageText: string;
  subject: string;
  refId: string;
  canAddBack: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly realtime: RealtimeEmitter,
    @Inject(forwardRef(() => ChatsService))
    private readonly chatsService: ChatsService,
  ) {}

  async listForUser(userId: string): Promise<NotificationDto[]> {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        actor: { select: { id: true, nickname: true } },
      },
    });

    const favoritedActorIds = new Set<string>();
    if (items.length > 0) {
      const favoriteRows = await this.prisma.wandererReaction.findMany({
        where: {
          viewerId: userId,
          type: 'FAVORITE',
          targetUserId: { in: items.map((item) => item.actorId) },
        },
        select: { targetUserId: true },
      });
      for (const row of favoriteRows) {
        favoritedActorIds.add(row.targetUserId);
      }
    }

    return Promise.all(items.map((item) => this.toDto(item, favoritedActorIds)));
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    await this.emitUnread(userId);
    return { ok: true as const };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.emitUnread(userId);
    return { ok: true as const };
  }

  async remove(userId: string, notificationId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Уведомление не найдено');
    }
    await this.emitUnread(userId);
    return { ok: true as const };
  }

  async notifyFavoriteReceived(actorId: string, targetUserId: string) {
    const notification = await this.prisma.notification.upsert({
      where: {
        userId_type_actorId_refId: {
          userId: targetUserId,
          type: NotificationType.FAVORITE_RECEIVED,
          actorId,
          refId: '',
        },
      },
      create: {
        userId: targetUserId,
        actorId,
        type: NotificationType.FAVORITE_RECEIVED,
        subject: '',
        refId: '',
      },
      update: {
        readAt: null,
      },
      include: {
        actor: { select: { id: true, nickname: true } },
      },
    });

    const dto = await this.toDto(notification);
    this.realtime.emitNotificationNew(targetUserId, dto);
    await this.emitUnread(targetUserId);
    await this.chatsService.postFavoriteReceivedMessage(actorId, targetUserId);
    return dto;
  }

  async notifyFavoriteReturned(actorId: string, targetUserId: string) {
    const notification = await this.prisma.notification.upsert({
      where: {
        userId_type_actorId_refId: {
          userId: targetUserId,
          type: NotificationType.FAVORITE_RETURNED,
          actorId,
          refId: '',
        },
      },
      create: {
        userId: targetUserId,
        actorId,
        type: NotificationType.FAVORITE_RETURNED,
        subject: '',
        refId: '',
      },
      update: {
        readAt: null,
      },
      include: {
        actor: { select: { id: true, nickname: true } },
      },
    });

    const dto = await this.toDto(notification);
    this.realtime.emitNotificationNew(targetUserId, dto);
    await this.emitUnread(targetUserId);
    await this.chatsService.postFavoriteReceivedMessage(actorId, targetUserId);
    return dto;
  }

  async notifyGameApplication(
    actorId: string,
    masterId: string,
    game: { id: string; title: string },
  ) {
    if (actorId === masterId) {
      return null;
    }

    const notification = await this.prisma.notification.upsert({
      where: {
        userId_type_actorId_refId: {
          userId: masterId,
          type: NotificationType.GAME_APPLICATION,
          actorId,
          refId: game.id,
        },
      },
      create: {
        userId: masterId,
        actorId,
        type: NotificationType.GAME_APPLICATION,
        subject: game.title.trim() || 'Игра',
        refId: game.id,
      },
      update: {
        readAt: null,
        subject: game.title.trim() || 'Игра',
      },
      include: {
        actor: { select: { id: true, nickname: true } },
      },
    });

    const dto = await this.toDto(notification);
    this.realtime.emitNotificationNew(masterId, dto);
    await this.emitUnread(masterId);
    return dto;
  }

  async notifyGameApplicationAccepted(
    masterId: string,
    applicantId: string,
    game: { id: string; title: string },
  ) {
    return this.notifyGameApplicationDecision(
      masterId,
      applicantId,
      game,
      NotificationType.GAME_APPLICATION_ACCEPTED,
    );
  }

  async notifyGameApplicationRejected(
    masterId: string,
    applicantId: string,
    game: { id: string; title: string },
  ) {
    return this.notifyGameApplicationDecision(
      masterId,
      applicantId,
      game,
      NotificationType.GAME_APPLICATION_REJECTED,
    );
  }

  async notifyGamePlayerRemoved(
    masterId: string,
    playerId: string,
    game: { id: string; title: string },
  ) {
    return this.notifyGameApplicationDecision(
      masterId,
      playerId,
      game,
      NotificationType.GAME_PLAYER_REMOVED,
    );
  }

  private async notifyGameApplicationDecision(
    masterId: string,
    applicantId: string,
    game: { id: string; title: string },
    type:
      | typeof NotificationType.GAME_APPLICATION_ACCEPTED
      | typeof NotificationType.GAME_APPLICATION_REJECTED
      | typeof NotificationType.GAME_PLAYER_REMOVED,
  ) {
    if (masterId === applicantId) {
      return null;
    }

    const notification = await this.prisma.notification.upsert({
      where: {
        userId_type_actorId_refId: {
          userId: applicantId,
          type,
          actorId: masterId,
          refId: game.id,
        },
      },
      create: {
        userId: applicantId,
        actorId: masterId,
        type,
        subject: game.title.trim() || 'Игра',
        refId: game.id,
      },
      update: {
        readAt: null,
        subject: game.title.trim() || 'Игра',
      },
      include: {
        actor: { select: { id: true, nickname: true } },
      },
    });

    const dto = await this.toDto(notification);
    this.realtime.emitNotificationNew(applicantId, dto);
    await this.emitUnread(applicantId);
    return dto;
  }

  private async emitUnread(userId: string) {
    const [notifications, chats] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.chatsService.countUnreadChats(userId),
    ]);
    this.realtime.emitUnreadSync(userId, { chats, notifications });
  }

  private async toDto(
    item: {
      id: string;
      type: NotificationType;
      userId: string;
      actorId: string;
      subject: string;
      refId: string;
      readAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      actor: { id: string; nickname: string };
    },
    favoritedActorIds?: Set<string>,
  ): Promise<NotificationDto> {
    const avatarUrl = await this.getAvatarUrl(item.actor.id);

    if (item.type === NotificationType.GAME_APPLICATION) {
      return {
        id: item.id,
        type: 'game_application',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'подал заявку на игру',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }

    if (item.type === NotificationType.GAME_APPLICATION_ACCEPTED) {
      return {
        id: item.id,
        type: 'game_application_accepted',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'принял вас за стол',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }

    if (item.type === NotificationType.GAME_APPLICATION_REJECTED) {
      return {
        id: item.id,
        type: 'game_application_rejected',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'отклонил вашу заявку',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }

    if (item.type === NotificationType.GAME_PLAYER_REMOVED) {
      return {
        id: item.id,
        type: 'game_player_removed',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'убрал вас из состава',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }

    const isReturned = item.type === NotificationType.FAVORITE_RETURNED;
    const alreadyFavorited = favoritedActorIds
      ? favoritedActorIds.has(item.actor.id)
      : Boolean(
          await this.prisma.wandererReaction.findUnique({
            where: {
              viewerId_targetUserId: {
                viewerId: item.userId,
                targetUserId: item.actor.id,
              },
            },
            select: { type: true },
          }).then((row) => row?.type === 'FAVORITE'),
        );

    return {
      id: item.id,
      type: isReturned ? 'favorite_returned' : 'favorite_received',
      actor: {
        id: item.actor.id,
        nickname: item.actor.nickname,
        avatarUrl,
      },
      actionText: isReturned
        ? 'добавил вас в избранные в ответ.'
        : 'добавил вас в избранные.',
      messageText: isReturned ? '' : ' Ответьте взаимностью, чтобы объединиться.',
      subject: '',
      refId: '',
      canAddBack: !isReturned && !alreadyFavorited,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async getAvatarUrl(userId: string): Promise<string | null> {
    const media = await this.mediaService.getCollection({
      entityType: 'User',
      entityId: userId,
      collection: 'avatar',
    });
    const urls = await this.mediaService.getCollectionUrls(media);
    return urls.thumb ?? urls.small ?? urls.medium ?? urls.large ?? null;
  }
}
