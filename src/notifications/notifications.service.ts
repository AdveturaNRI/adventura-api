import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

import { ChatsService } from '../chats/chats.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';

export type NotificationDto = {
  id: string;
  type:
    | 'favorite_received'
    | 'favorite_returned'
    | 'game_application'
    | 'game_application_accepted'
    | 'game_application_rejected'
    | 'game_player_removed'
    | 'game_deleted'
    | 'club_deleted'
    | 'system_announcement';
  actor: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  actionText: string;
  messageText: string;
  subject: string;
  refId: string;
  /** In-app / push deep link for the related entity. */
  href: string | null;
  canAddBack: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Keep in sync with client `getPortalNotificationHref`. */
export function resolveNotificationHref(input: {
  type: NotificationDto['type'];
  refId?: string | null;
  actor?: { id?: string | null } | null;
}): string | null {
  const refId = input.refId?.trim() || '';
  const actorId = input.actor?.id?.trim() || '';

  switch (input.type) {
    case 'game_application':
      return refId ? `/games-manage?id=${encodeURIComponent(refId)}` : '/my-games';
    case 'game_application_accepted':
    case 'game_application_rejected':
    case 'game_player_removed':
      return refId ? `/games/${encodeURIComponent(refId)}` : '/games';
    case 'game_deleted':
      return '/my-games';
    case 'club_deleted':
      return '/my-clubs';
    case 'favorite_received':
    case 'favorite_returned':
      return actorId ? `/users/${encodeURIComponent(actorId)}` : null;
    case 'system_announcement':
      return null;
    default:
      return null;
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly realtime: RealtimeEmitter,
    private readonly pushSubscriptions: PushSubscriptionsService,
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
    void this.pushPortalNotification(targetUserId, dto);
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
    void this.pushPortalNotification(targetUserId, dto);
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
    void this.pushPortalNotification(masterId, dto);
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

  async notifyGameDeleted(
    masterId: string,
    playerIds: string[],
    game: { id: string; title: string },
  ) {
    const uniquePlayerIds = [...new Set(playerIds)].filter((id) => id && id !== masterId);
    if (uniquePlayerIds.length === 0) {
      return [];
    }

    const subject = game.title.trim() || 'Игра';
    const results = [];

    for (const playerId of uniquePlayerIds) {
      const notification = await this.prisma.notification.upsert({
        where: {
          userId_type_actorId_refId: {
            userId: playerId,
            type: NotificationType.GAME_DELETED,
            actorId: masterId,
            refId: game.id,
          },
        },
        create: {
          userId: playerId,
          actorId: masterId,
          type: NotificationType.GAME_DELETED,
          subject,
          refId: game.id,
        },
        update: {
          readAt: null,
          subject,
        },
        include: {
          actor: { select: { id: true, nickname: true } },
        },
      });

      const dto = await this.toDto(notification);
      this.realtime.emitNotificationNew(playerId, dto);
      await this.emitUnread(playerId);
      void this.pushPortalNotification(playerId, dto);
      results.push(dto);
    }

    return results;
  }

  async notifyClubDeleted(
    actorId: string,
    memberIds: string[],
    club: { id: string; name: string },
  ) {
    const recipients = [...new Set(memberIds)].filter((id) => id && id !== actorId);
    if (recipients.length === 0) {
      return [];
    }

    const subject = club.name.trim() || 'Клуб';
    const results = [];
    for (const userId of recipients) {
      const notification = await this.prisma.notification.upsert({
        where: {
          userId_type_actorId_refId: {
            userId,
            type: NotificationType.CLUB_DELETED,
            actorId,
            refId: club.id,
          },
        },
        create: {
          userId,
          actorId,
          type: NotificationType.CLUB_DELETED,
          subject,
          refId: club.id,
        },
        update: { readAt: null, subject },
        include: { actor: { select: { id: true, nickname: true } } },
      });
      const dto = await this.toDto(notification);
      this.realtime.emitNotificationNew(userId, dto);
      await this.emitUnread(userId);
      void this.pushPortalNotification(userId, dto);
      results.push(dto);
    }
    return results;
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
    void this.pushPortalNotification(applicantId, dto);
    return dto;
  }

  private async pushPortalNotification(userId: string, dto: NotificationDto) {
    const actorName = dto.actor.nickname;
    const subject = dto.subject.trim();
    let title = 'Adventura';
    let body = `${actorName} ${dto.actionText}`.trim();
    const url = dto.href ?? '/notifications';
    const tag = `notif:${dto.type}:${dto.refId || dto.actor.id}`;

    if (dto.type === 'system_announcement') {
      title = subject || 'Adventura';
      body = dto.messageText.trim() || subject || 'Новое объявление';
    } else if (dto.type === 'game_application') {
      title = subject ? `Новая заявка на игру «${subject}»` : 'Новая заявка на игру';
      body = actorName;
    } else if (
      dto.type === 'game_application_accepted' ||
      dto.type === 'game_application_rejected' ||
      dto.type === 'game_player_removed' ||
      dto.type === 'game_deleted' ||
      dto.type === 'club_deleted'
    ) {
      title = subject || 'Adventura';
      body = `${actorName} ${dto.actionText}`.trim();
    } else if (dto.type === 'favorite_received' || dto.type === 'favorite_returned') {
      title = actorName;
      body = `${dto.actionText}${dto.messageText}`.trim();
    }

    await this.pushSubscriptions.sendToUser(userId, { title, body, tag, url });
  }

  /** Used by BroadcastService — keep realtime unread in sync. */
  async emitUnreadPublic(userId: string) {
    return this.emitUnread(userId);
  }

  async pushPortalNotificationPublic(userId: string, dto: NotificationDto) {
    return this.pushPortalNotification(userId, dto);
  }

  async toDtoPublic(
    item: {
      id: string;
      type: NotificationType;
      userId: string;
      actorId: string;
      subject: string;
      body?: string;
      refId: string;
      readAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      actor: { id: string; nickname: string };
    },
    favoritedActorIds?: Set<string>,
  ) {
    return this.toDto(item, favoritedActorIds);
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
      body?: string;
      refId: string;
      readAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      actor: { id: string; nickname: string };
    },
    favoritedActorIds?: Set<string>,
  ): Promise<NotificationDto> {
    const avatarUrl = await this.getAvatarUrl(item.actor.id);

    const withHref = (
      dto: Omit<NotificationDto, 'href'>,
    ): NotificationDto => ({
      ...dto,
      href: resolveNotificationHref(dto),
    });


    if (item.type === NotificationType.SYSTEM_ANNOUNCEMENT) {
      return withHref({
        id: item.id,
        type: 'system_announcement',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname || 'Adventura',
          avatarUrl,
        },
        actionText: 'объявление',
        messageText: (item.body ?? '').trim(),
        subject: item.subject.trim() || 'Adventura',
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
});
    }

    if (item.type === NotificationType.GAME_APPLICATION) {
      return withHref({
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
});
    }

    if (item.type === NotificationType.GAME_APPLICATION_ACCEPTED) {
      return withHref({
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
});
    }

    if (item.type === NotificationType.GAME_APPLICATION_REJECTED) {
      return withHref({
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
});
    }

    if (item.type === NotificationType.GAME_PLAYER_REMOVED) {
      return withHref({
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
});
    }


    if (item.type === NotificationType.GAME_DELETED) {
      return withHref({
        id: item.id,
        type: 'game_deleted',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'удалил игру',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
});
    }

    if (item.type === NotificationType.CLUB_DELETED) {
      return withHref({
        id: item.id,
        type: 'club_deleted',
        actor: {
          id: item.actor.id,
          nickname: item.actor.nickname,
          avatarUrl,
        },
        actionText: 'распустил клуб',
        messageText: '',
        subject: item.subject,
        refId: item.refId,
        canAddBack: false,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
});
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

    return withHref({
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
    });
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
