import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';

export type WebPushPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
};

@Injectable()
export class PushSubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(PushSubscriptionsService.name);
  private configured = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  onModuleInit() {
    // TODO: вернуть чтение из env (VAPID_*), пока захардкожено для локальной отладки.
    const publicKey =
      'BA-_N1Y8YDBuMgiH-9dv4y6QxQm3g-OClScxW-XKVg5e1rgGw2c0BZyA2L-qdU861jhe3x4RyBNQcdiRgJ2fIBw';
    const privateKey = 'LPX80C41EA3IsQ57LLX4uR0dt6jo2EnrHu_ZqrOseIc';
    const subject = 'mailto:admin@adventura.local';

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.configured = true;
    } catch (error) {
      this.logger.error(
        `Invalid VAPID keys — web push disabled: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  getPublicKey() {
    return { publicKey: this.publicKey || null, enabled: this.configured };
  }

  async upsertSubscription(
    userId: string,
    input: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ) {
    const endpoint = input.endpoint.trim();
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent?.trim() || null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent?.trim() || null,
      },
    });
    return { ok: true as const, id: row.id };
  }

  async removeByEndpoint(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: endpoint.trim() },
    });
    return { ok: true as const };
  }

  async statusForEndpoint(userId: string, endpoint: string) {
    if (!endpoint.trim()) {
      return { subscribed: false };
    }
    const row = await this.prisma.pushSubscription.findFirst({
      where: { userId, endpoint: endpoint.trim() },
      select: { id: true },
    });
    return { subscribed: Boolean(row) };
  }

  async sendToUser(userId: string, payload: WebPushPayload) {
    if (!this.configured) {
      return;
    }
    if (this.realtime.isOnline(userId)) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) {
      return;
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon ?? '/icons/icon-192.png',
      tag: payload.tag,
      url: payload.url ?? '/',
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (error) {
          const statusCode =
            typeof error === 'object' &&
            error &&
            'statusCode' in error &&
            typeof (error as { statusCode?: unknown }).statusCode === 'number'
              ? (error as { statusCode: number }).statusCode
              : null;

          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: sub.endpoint },
            });
            return;
          }

          this.logger.warn(
            `Push failed for ${sub.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }
}
