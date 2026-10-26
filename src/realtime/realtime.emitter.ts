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
  type TypingUpdatePayload,
  type UnreadSyncPayload,
} from './realtime.events';

/** A `presence:active` ping keeps the socket «в сети» this long; clients repeat it every 30 s. */
export const PRESENCE_ACTIVE_TTL_MS = 90_000;

@Injectable()
export class RealtimeEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server: Server | null = null;
  /** Fallback when REDIS_URL is unset (single-node / local): userId → socketId → active until (ms). */
  private readonly onlineSockets = new Map<string, Map<string, number>>();
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

  /**
   * Sorted set per user: member = socketId, score = "active until" (ms). An entry that
   * is not refreshed simply expires, so sockets of a crashed or redeployed replica
   * stop counting within PRESENCE_ACTIVE_TTL_MS instead of lingering for a day.
   */
  private presenceKey(userId: string) {
    return `rt:presence:${userId}`;
  }

  /**
   * Marks the socket active until now + ttl.
   * @returns true if the user had no active sockets before (became online).
   */
  async touchActive(userId: string, socketId: string): Promise<boolean> {
    const before = await this.activeSocketCount(userId);
    const until = Date.now() + PRESENCE_ACTIVE_TTL_MS;
    if (this.redis) {
      const key = this.presenceKey(userId);
      await this.redis.zAdd(key, { score: until, value: socketId });
      await this.redis.pExpire(key, PRESENCE_ACTIVE_TTL_MS * 2);
    } else {
      let sockets = this.onlineSockets.get(userId);
      if (!sockets) {
        sockets = new Map();
        this.onlineSockets.set(userId, sockets);
      }
      sockets.set(socketId, until);
    }
    return before === 0;
  }

  /**
   * Drops the socket from presence (went idle or disconnected). Call it only for a socket
   * that was active: its entry may have already expired on its own.
   * @returns true if the user has no active sockets left (became offline).
   */
  async markInactive(userId: string, socketId: string): Promise<boolean> {
    if (this.redis) {
      await this.redis.zRem(this.presenceKey(userId), socketId);
    } else {
      const sockets = this.onlineSockets.get(userId);
      sockets?.delete(socketId);
      if (sockets?.size === 0) this.onlineSockets.delete(userId);
    }
    return (await this.activeSocketCount(userId)) === 0;
  }

  private async activeSocketCount(userId: string): Promise<number> {
    const now = Date.now();
    if (this.redis) {
      const key = this.presenceKey(userId);
      await this.redis.zRemRangeByScore(key, '-inf', now);
      return this.redis.zCard(key);
    }
    const sockets = this.onlineSockets.get(userId);
    if (!sockets) return 0;
    for (const [socketId, until] of sockets) {
      if (until <= now) sockets.delete(socketId);
    }
    if (sockets.size === 0) this.onlineSockets.delete(userId);
    return sockets.size;
  }

  /** «В сети» in chats and wanderer cards: an open tab the user is actually using. */
  async isPresent(userId: string): Promise<boolean> {
    return (await this.activeSocketCount(userId)) > 0;
  }

  /** Unique users with at least one active socket (local-only without Redis). */
  onlineCount(): number {
    const now = Date.now();
    let count = 0;
    for (const sockets of this.onlineSockets.values()) {
      if ([...sockets.values()].some((until) => until > now)) count += 1;
    }
    return count;
  }

  /** Cluster-wide active users (Redis keys) or local Map size. */
  async countOnlineUsers(): Promise<number> {
    if (!this.redis) {
      return this.onlineCount();
    }
    const now = Date.now();
    let count = 0;
    for await (const keys of this.redis.scanIterator({
      MATCH: 'rt:presence:*',
      COUNT: 200,
    })) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if ((await this.redis.zCount(key, now, '+inf')) > 0) count += 1;
      }
    }
    return count;
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

  emitTypingUpdate(userIds: string[], payload: TypingUpdatePayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.TYPING_UPDATE, payload);
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
