import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BroadcastCampaignStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  buildRecipientWhere,
  normalizeBroadcastFilters,
  type BroadcastChannels,
  type BroadcastFilters,
} from './broadcast-filters';
import { NotificationsService } from './notifications.service';

const BATCH_SIZE = 150;
const PUSH_CONCURRENCY = 20;

export type BroadcastPreview = {
  count: number;
  filters: BroadcastFilters;
};

export type BroadcastCampaignDto = {
  id: string;
  title: string;
  body: string;
  filters: BroadcastFilters;
  sendInApp: boolean;
  sendPush: boolean;
  status: BroadcastCampaignStatus;
  recipientCount: number;
  sentCount: number;
  pushCount: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async preview(rawFilters: unknown): Promise<BroadcastPreview> {
    const filters = normalizeBroadcastFilters(rawFilters);
    const count = await this.prisma.user.count({
      where: buildRecipientWhere(filters),
    });
    return { count, filters };
  }

  async listCampaigns(take = 30): Promise<BroadcastCampaignDto[]> {
    const rows = await this.prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
    return rows.map((row) => this.toCampaignDto(row));
  }

  async send(input: {
    title: string;
    body: string;
    filters?: unknown;
    channels?: BroadcastChannels;
    createdById?: string | null;
  }): Promise<BroadcastCampaignDto> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title) {
      throw new Error('Укажите заголовок');
    }
    if (!body) {
      throw new Error('Укажите текст сообщения');
    }

    const filters = normalizeBroadcastFilters(input.filters);
    const sendInApp = input.channels?.inApp !== false;
    const sendPush = input.channels?.push !== false;
    if (!sendInApp && !sendPush) {
      throw new Error('Выберите хотя бы один канал: in-app или push');
    }

    const actorId = await this.resolveActorId(input.createdById);
    const where = buildRecipientWhere(filters);
    const recipientCount = await this.prisma.user.count({ where });

    const campaign = await this.prisma.broadcastCampaign.create({
      data: {
        title,
        body,
        filters: filters as Prisma.InputJsonValue,
        sendInApp,
        sendPush,
        status: BroadcastCampaignStatus.SENDING,
        createdById: actorId,
        recipientCount,
      },
    });

    try {
      const { sentCount, pushCount } = await this.deliver({
        campaignId: campaign.id,
        actorId,
        title,
        body,
        where,
        sendInApp,
        sendPush,
      });

      const updated = await this.prisma.broadcastCampaign.update({
        where: { id: campaign.id },
        data: {
          status: BroadcastCampaignStatus.SENT,
          sentCount,
          pushCount,
          sentAt: new Date(),
          error: null,
        },
      });
      return this.toCampaignDto(updated);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Broadcast ${campaign.id} failed: ${message}`);
      const failed = await this.prisma.broadcastCampaign.update({
        where: { id: campaign.id },
        data: {
          status: BroadcastCampaignStatus.FAILED,
          error: message.slice(0, 2000),
        },
      });
      return this.toCampaignDto(failed);
    }
  }

  private async deliver(options: {
    campaignId: string;
    actorId: string;
    title: string;
    body: string;
    where: Prisma.UserWhereInput;
    sendInApp: boolean;
    sendPush: boolean;
  }): Promise<{ sentCount: number; pushCount: number }> {
    let cursor: string | undefined;
    let sentCount = 0;
    let pushCount = 0;

    for (;;) {
      const users = await this.prisma.user.findMany({
        where: options.where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (users.length === 0) {
        break;
      }
      cursor = users[users.length - 1]!.id;
      const userIds = users.map((u) => u.id);

      if (options.sendInApp) {
        await this.prisma.notification.createMany({
          data: userIds.map((userId) => ({
            userId,
            actorId: options.actorId,
            type: NotificationType.SYSTEM_ANNOUNCEMENT,
            subject: options.title,
            body: options.body,
            refId: options.campaignId,
          })),
          skipDuplicates: true,
        });

        const rows = await this.prisma.notification.findMany({
          where: {
            type: NotificationType.SYSTEM_ANNOUNCEMENT,
            refId: options.campaignId,
            userId: { in: userIds },
          },
          include: {
            actor: { select: { id: true, nickname: true } },
          },
        });

        sentCount += rows.length;

        await this.mapPool(rows, PUSH_CONCURRENCY, async (row) => {
          const dto = await this.notifications.toDtoPublic(row);
          this.realtime.emitNotificationNew(row.userId, dto);
          await this.notifications.emitUnreadPublic(row.userId);
          if (options.sendPush) {
            await this.notifications.pushPortalNotificationPublic(row.userId, dto);
            pushCount += 1;
          }
        });
      } else if (options.sendPush) {
        await this.mapPool(userIds, PUSH_CONCURRENCY, async (userId) => {
          await this.pushSubscriptions.sendToUser(userId, {
            title: options.title,
            body: options.body,
            tag: `broadcast-${options.campaignId}`,
            url: '/notifications',
          });
          pushCount += 1;
          sentCount += 1;
        });
      }
    }

    return { sentCount, pushCount };
  }

  private async resolveActorId(preferred?: string | null): Promise<string> {
    if (preferred) {
      const preferredUser = await this.prisma.user.findFirst({
        where: { id: preferred, isGuest: false },
        select: { id: true },
      });
      if (preferredUser) {
        return preferredUser.id;
      }
    }

    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim();
    if (adminEmail) {
      const admin = await this.prisma.user.findFirst({
        where: { email: adminEmail, isGuest: false },
        select: { id: true },
      });
      if (admin) {
        return admin.id;
      }
    }

    const any = await this.prisma.user.findFirst({
      where: { isGuest: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!any) {
      throw new Error('Нет пользователей для actorId рассылки');
    }
    return any.id;
  }

  private async mapPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    let index = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const current = items[index++]!;
          await worker(current);
        }
      },
    );
    await Promise.all(runners);
  }

  private toCampaignDto(row: {
    id: string;
    title: string;
    body: string;
    filters: Prisma.JsonValue;
    sendInApp: boolean;
    sendPush: boolean;
    status: BroadcastCampaignStatus;
    recipientCount: number;
    sentCount: number;
    pushCount: number;
    error: string | null;
    createdAt: Date;
    sentAt: Date | null;
  }): BroadcastCampaignDto {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      filters: normalizeBroadcastFilters(row.filters),
      sendInApp: row.sendInApp,
      sendPush: row.sendPush,
      status: row.status,
      recipientCount: row.recipientCount,
      sentCount: row.sentCount,
      pushCount: row.pushCount,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    };
  }
}
