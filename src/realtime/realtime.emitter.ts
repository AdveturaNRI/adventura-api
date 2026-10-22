import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { Server } from 'socket.io';

import {
  REALTIME_EVENTS,
  type AnnouncementPublishedPayload,
  type CallInvitePayload,
  type CallSignalPayload,
  type ConversationDeletedPayload,
  type ConversationReadPayload,
  type PresenceUpdatePayload,
  type UnreadSyncPayload,
} from './realtime.events';

@Injectable()
export class RealtimeEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server: Server | null = null;
  /** Fallback when REDIS_URL is unset (single-node / local). */
  private readonly onlineSockets = new Map<string, Set<string>>();
  private redis: RedisClientType | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  /** Shared presence across API replicas. Same Redis as Socket.IO adapter. */
  async connectPresence(url: string): Promise<void> {
    const client: RedisClientType = createClient({ url });
    client.on('error', (err) =>
      this.logger.error(`Presence Redis: ${err.message}`),
    );
    await client.connect();
    this.redis = client;
    this.logger.log('Realtime presence store connected');
  }

  async onModuleDestroy() {
    if (this.redis?.isOpen) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  private presenceKey(userId: string) {
    return `rt:online:${userId}`;
  }

  /** @returns true if this was the first socket for the user (became online). */
  async markOnline(userId: string, socketId: string): Promise<boolean> {
    if (this.redis) {
      const key = this.presenceKey(userId);
      const before = await this.redis.sCard(key);
      await this.redis.sAdd(key, socketId);
      // Safety TTL if disconnect hook is missed (crash / kill -9).
      await this.redis.expire(key, 60 * 60 * 24);
      return before === 0;
    }

    let sockets = this.onlineSockets.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.onlineSockets.set(userId, sockets);
    }
    const wasOffline = sockets.size === 0;
    sockets.add(socketId);
    return wasOffline;
  }

  /** @returns true if the user has no sockets left (became offline). */
  async markOffline(userId: string, socketId: string): Promise<boolean> {
    if (this.redis) {
      const key = this.presenceKey(userId);
      await this.redis.sRem(key, socketId);
      const left = await this.redis.sCard(key);
      if (left === 0) {
        await this.redis.del(key);
        return true;
      }
      return false;
    }

    const sockets = this.onlineSockets.get(userId);
    if (!sockets) {
      return true;
    }
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.onlineSockets.delete(userId);
      return true;
    }
    return false;
  }

  async isOnline(userId: string): Promise<boolean> {
    if (this.redis) {
      return (await this.redis.sCard(this.presenceKey(userId))) > 0;
    }
    return (this.onlineSockets.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Online for chat UI: active websocket, or recent HTTP activity from any app section.
   * Keeps "в сети" accurate when the user browses games/profile without opening chats.
   */
  async isPresent(userId: string, lastSeenAt?: Date | null): Promise<boolean> {
    if (await this.isOnline(userId)) {
      return true;
    }
    if (!lastSeenAt) {
      return false;
    }
    return Date.now() - lastSeenAt.getTime() < 90_000;
  }

  /** Unique users with at least one active socket (local-only without Redis). */
  onlineCount(): number {
    return this.onlineSockets.size;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const userId of userIds) {
      this.emitToUser(userId, event, payload);
    }
  }

  emitMessageNew(userIds: string[], payload: unknown) {
    this.emitToUsers(userIds, REALTIME_EVENTS.MESSAGE_NEW, payload);
  }

  emitMessageReaction(userIds: string[], payload: unknown) {
    this.emitToUsers(userIds, REALTIME_EVENTS.MESSAGE_REACTION, payload);
  }

  emitReactionUnreadSync(
    userId: string,
    payload: { conversationId: string; count: number },
  ) {
    this.emitToUser(userId, REALTIME_EVENTS.REACTION_UNREAD_SYNC, payload);
  }

  emitConversationUpdated(userIds: string[], payload: unknown) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_UPDATED, payload);
  }

  emitConversationRead(userIds: string[], payload: ConversationReadPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_READ, payload);
  }

  emitConversationDeleted(
    userIds: string[],
    payload: ConversationDeletedPayload,
  ) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_DELETED, payload);
  }

  emitNotificationNew(userId: string, payload: unknown) {
    this.emitToUser(userId, REALTIME_EVENTS.NOTIFICATION_NEW, payload);
  }

  /** Broadcast to all connected sockets — clients filter by dismissals via HTTP. */
  emitAnnouncementPublished(payload: AnnouncementPublishedPayload) {
    this.server?.emit(REALTIME_EVENTS.ANNOUNCEMENT_PUBLISHED, payload);
  }

  emitUnreadSync(userId: string, payload: UnreadSyncPayload) {
    this.emitToUser(userId, REALTIME_EVENTS.UNREAD_SYNC, payload);
  }

  emitPresenceUpdate(userIds: string[], payload: PresenceUpdatePayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.PRESENCE_UPDATE, payload);
  }

  emitCallInvite(userIds: string[], payload: CallInvitePayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CALL_INVITE, payload);
  }

  emitCallAccepted(userIds: string[], payload: CallSignalPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CALL_ACCEPTED, payload);
  }

  emitCallDeclined(userIds: string[], payload: CallSignalPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CALL_DECLINED, payload);
  }

  emitCallEnded(userIds: string[], payload: CallSignalPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CALL_ENDED, payload);
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }
}
