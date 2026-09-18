import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

import {
  REALTIME_EVENTS,
  type ConversationDeletedPayload,
  type ConversationReadPayload,
  type PresenceUpdatePayload,
  type UnreadSyncPayload,
} from './realtime.events';

@Injectable()
export class RealtimeEmitter {
  private server: Server | null = null;
  private readonly onlineSockets = new Map<string, Set<string>>();

  setServer(server: Server) {
    this.server = server;
  }

  markOnline(userId: string, socketId: string): boolean {
    let sockets = this.onlineSockets.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.onlineSockets.set(userId, sockets);
    }
    const wasOffline = sockets.size === 0;
    sockets.add(socketId);
    return wasOffline;
  }

  markOffline(userId: string, socketId: string): boolean {
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

  isOnline(userId: string): boolean {
    return (this.onlineSockets.get(userId)?.size ?? 0) > 0;
  }

  /** Unique users with at least one active socket. */
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

  emitConversationUpdated(userIds: string[], payload: unknown) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_UPDATED, payload);
  }

  emitConversationRead(userIds: string[], payload: ConversationReadPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_READ, payload);
  }

  emitConversationDeleted(userIds: string[], payload: ConversationDeletedPayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.CONVERSATION_DELETED, payload);
  }

  emitNotificationNew(userId: string, payload: unknown) {
    this.emitToUser(userId, REALTIME_EVENTS.NOTIFICATION_NEW, payload);
  }

  emitUnreadSync(userId: string, payload: UnreadSyncPayload) {
    this.emitToUser(userId, REALTIME_EVENTS.UNREAD_SYNC, payload);
  }

  emitPresenceUpdate(userIds: string[], payload: PresenceUpdatePayload) {
    this.emitToUsers(userIds, REALTIME_EVENTS.PRESENCE_UPDATE, payload);
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }
}
