import { readFileSync } from 'fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';

import { AppSettingsService } from '../app-settings/app-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';

export type WebPushPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
  /** Keep toast until user interacts (useful for call invites). */
  requireInteraction?: boolean;
};

const FCM_KEY_MARKER = 'fcm';

function isFcmSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  return (
    sub.p256dh === FCM_KEY_MARKER ||
    sub.auth === FCM_KEY_MARKER ||
    (!sub.endpoint.startsWith('http://') && !sub.endpoint.startsWith('https://'))
  );
}

@Injectable()
export class PushSubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(PushSubscriptionsService.name);
  private webpushConfigured = false;
  private fcmConfigured = false;
  private publicKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeEmitter,
    private readonly appSettings: AppSettingsService,
  ) {}

  onModuleInit() {
    this.initWebPush();
    void this.initFirebase();
  }

  private initWebPush() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject =
      this.config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:admin@adventura.local';

    if (!publicKey || !privateKey) {
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.webpushConfigured = true;
    } catch (error) {
      this.logger.error(
        `Invalid VAPID keys — legacy web push disabled: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async initFirebase() {
    const vapid = await this.appSettings.resolveFirebaseWebVapidKey();
    if (vapid) {
      this.publicKey = vapid;
    }

    const jsonRaw = await this.appSettings.resolveFirebaseServiceAccountJson();
    const jsonPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')?.trim();
    const projectId =
      (await this.appSettings.getFirebaseProjectId()) ||
      this.config.get<string>('FIREBASE_PROJECT_ID')?.trim() ||
      '';

    if (!jsonRaw && !jsonPath) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON/PATH missing — FCM send disabled (client tokens still ok if VAPID set)',
      );
      return;
    }

    try {
      if (admin.apps.length === 0) {
        let parsed: admin.ServiceAccount;
        if (jsonRaw) {
          parsed = JSON.parse(jsonRaw) as admin.ServiceAccount;
        } else {
          parsed = JSON.parse(readFileSync(jsonPath!, 'utf8')) as admin.ServiceAccount;
        }
        admin.initializeApp({
          credential: admin.credential.cert(parsed),
          projectId: projectId || parsed.projectId,
        });
      }
      this.fcmConfigured = true;
      this.logger.log('Firebase Admin ready for FCM');
    } catch (error) {
      this.fcmConfigured = false;
      this.logger.error(
        `Firebase Admin init failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** After admin saves VAPID / service account — hot-reload without restart. */
  async reloadFirebaseFromSettings() {
    const vapid = await this.appSettings.resolveFirebaseWebVapidKey();
    this.publicKey = vapid || this.publicKey;

    if (this.fcmConfigured) {
      return;
    }

    const jsonRaw = await this.appSettings.resolveFirebaseServiceAccountJson();
    const jsonPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')?.trim();
    const projectId =
      (await this.appSettings.getFirebaseProjectId()) ||
      this.config.get<string>('FIREBASE_PROJECT_ID')?.trim() ||
      '';

    if (!jsonRaw && !jsonPath) {
      return;
    }

    try {
      if (admin.apps.length === 0) {
        let parsed: admin.ServiceAccount;
        if (jsonRaw) {
          parsed = JSON.parse(jsonRaw) as admin.ServiceAccount;
        } else {
          parsed = JSON.parse(readFileSync(jsonPath!, 'utf8')) as admin.ServiceAccount;
        }
        admin.initializeApp({
          credential: admin.credential.cert(parsed),
          projectId: projectId || parsed.projectId,
        });
      }
      this.fcmConfigured = true;
      this.logger.log('Firebase Admin ready for FCM (reloaded from settings)');
    } catch (error) {
      this.logger.error(
        `Firebase Admin reload failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getPublicKey() {
    const fcmVapid = await this.appSettings.resolveFirebaseWebVapidKey();
    const key = fcmVapid || this.publicKey || null;
    if (fcmVapid) {
      this.publicKey = fcmVapid;
    }
    // VAPID alone is enough for client subscribe (FCM getToken). Send needs SA.
    const enabled = Boolean(key);
    const useFcm = Boolean(fcmVapid) || this.fcmConfigured;
    return {
      publicKey: key,
      enabled,
      provider: useFcm ? ('fcm' as const) : this.webpushConfigured ? ('webpush' as const) : ('none' as const),
      reason: enabled
        ? null
        : ('missing_vapid' as const),
      sendEnabled: this.fcmConfigured || this.webpushConfigured,
    };
  }

  getRuntimeStatus() {
    return {
      subscribeEnabled: Boolean(this.publicKey),
      sendEnabled: this.fcmConfigured || this.webpushConfigured,
      provider: this.fcmConfigured
        ? ('fcm' as const)
        : this.webpushConfigured
          ? ('webpush' as const)
          : ('none' as const),
      fcmConfigured: this.fcmConfigured,
      webpushConfigured: this.webpushConfigured,
    };
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

  async upsertFcmToken(
    userId: string,
    input: { token: string; userAgent?: string },
  ) {
    const token = input.token.trim();
    if (!token) {
      return { ok: false as const };
    }
    return this.upsertSubscription(userId, {
      endpoint: token,
      keys: { p256dh: FCM_KEY_MARKER, auth: FCM_KEY_MARKER },
      userAgent: input.userAgent,
    });
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
    if (!this.fcmConfigured && !this.webpushConfigured) {
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

    const icon = payload.icon ?? '/icons/icon-192.png';
    const url = payload.url ?? '/';
    const tag = payload.tag ?? 'adventura';
    const requireInteraction =
      payload.requireInteraction ?? (typeof tag === 'string' && tag.startsWith('call:'));

    await Promise.all(
      subscriptions.map(async (sub) => {
        if (isFcmSubscription(sub)) {
          await this.sendFcm(sub.endpoint, sub.id, {
            title: payload.title,
            body: payload.body,
            icon,
            tag,
            url,
            requireInteraction,
          });
          return;
        }
        if (!this.webpushConfigured) {
          return;
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              icon,
              tag,
              url,
              requireInteraction,
            }),
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

  private async sendFcm(
    token: string,
    subscriptionId: string,
    payload: Required<Pick<WebPushPayload, 'title' | 'body' | 'icon' | 'tag' | 'url'>> & {
      requireInteraction?: boolean;
    },
  ) {
    if (!this.fcmConfigured) {
      return;
    }
    try {
      await admin.messaging().send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon,
          tag: payload.tag,
          url: payload.url,
        },
        webpush: {
          notification: {
            icon: payload.icon,
            badge: payload.icon,
            tag: payload.tag,
            renotify: true,
            requireInteraction: Boolean(payload.requireInteraction),
          },
          fcmOptions: {
            link: payload.url.startsWith('http')
              ? payload.url
              : undefined,
          },
        },
      });
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        await this.prisma.pushSubscription.deleteMany({
          where: { endpoint: token },
        });
        return;
      }

      this.logger.warn(
        `FCM failed for ${subscriptionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
