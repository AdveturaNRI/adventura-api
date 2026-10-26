import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENTS, type TypingUpdatePayload } from './realtime.events';
import { PRESENCE_ACTIVE_TTL_MS, RealtimeEmitter } from './realtime.emitter';

type JwtPayload = {
  sub: string;
  email: string;
  nickname: string;
};

type SocketPresence = {
  /** Client sends presence:active / presence:idle; otherwise the socket is active while connected. */
  reportsActivity: boolean;
  active: boolean;
  lastPingAt: number;
  lastSeenWriteAt: number;
};

const PRESENCE_SWEEP_MS = 30_000;
/** lastSeenAt is written at most this often while the user stays active. */
const LAST_SEEN_WRITE_MS = 60_000;
/** How far back a client may date its last interaction when going idle. */
const PRESENCE_IDLE_BACKDATE_MAX_MS = 10 * 60_000;

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private presenceSweep: ReturnType<typeof setInterval> | null = null;

  /** Namespaced gateway: Nest injects the `/realtime` namespace, not the root server. */
  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server) {
    this.emitter.setServer(server);
    this.presenceSweep = setInterval(() => {
      void this.sweepPresence().catch((error) =>
        this.logger.warn(
          `Presence sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
        ),
      );
    }, PRESENCE_SWEEP_MS);
    this.presenceSweep.unref?.();
  }

  onModuleDestroy() {
    if (this.presenceSweep) clearInterval(this.presenceSweep);
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, nickname: true },
      });

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      client.data.nickname =
        user.nickname?.trim() ||
        (typeof payload.nickname === 'string' && payload.nickname.trim()
          ? payload.nickname.trim()
          : 'Участник');
      await client.join(this.emitter.userRoom(user.id));

      // New clients report activity themselves via presence:active / presence:idle.
      // Older app builds don't, so their open socket counts as «в сети» like before.
      const presence: SocketPresence = {
        reportsActivity: client.handshake.auth?.presence === true,
        active: false,
        lastPingAt: 0,
        lastSeenWriteAt: 0,
      };
      client.data.presence = presence;
      // The client sees `connect` before this async handler finishes, so its first ping may already be queued.
      if (!presence.reportsActivity || client.data.pendingActive === true) {
        await this.markActive(client, user.id);
      }

      const [chats, notifications] = await Promise.all([
        this.countUnreadChats(user.id),
        this.prisma.notification.count({
          where: { userId: user.id, readAt: null },
        }),
      ]);

      client.emit(REALTIME_EVENTS.UNREAD_SYNC, { chats, notifications });
    } catch (error) {
      this.logger.warn(
        `WS auth failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) {
      return;
    }
    await this.markIdle(client, userId, new Date());
    this.logger.debug(`WS disconnected user:${userId}`);
  }

  @SubscribeMessage(REALTIME_EVENTS.PRESENCE_ACTIVE)
  async handlePresenceActive(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId as string | undefined;
    const presence = client.data?.presence as SocketPresence | undefined;
    if (!userId || !presence) {
      client.data.pendingActive = true;
      return;
    }
    presence.reportsActivity = true;
    await this.markActive(client, userId);
  }

  @SubscribeMessage(REALTIME_EVENTS.PRESENCE_IDLE)
  async handlePresenceIdle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lastActiveAt?: unknown },
  ) {
    const userId = client.data?.userId as string | undefined;
    const presence = client.data?.presence as SocketPresence | undefined;
    if (!userId || !presence) {
      client.data.pendingActive = false;
      return;
    }
    presence.reportsActivity = true;
    const now = Date.now();
    const reported = typeof body?.lastActiveAt === 'number' ? body.lastActiveAt : now;
    const lastActiveAt = Math.min(now, Math.max(reported, now - PRESENCE_IDLE_BACKDATE_MAX_MS));
    await this.markIdle(client, userId, new Date(lastActiveAt));
  }

  private async markActive(client: Socket, userId: string) {
    const presence = client.data.presence as SocketPresence;
    const now = Date.now();
    presence.active = true;
    presence.lastPingAt = now;
    const becameOnline = await this.emitter.touchActive(userId, client.id);
    if (becameOnline || now - presence.lastSeenWriteAt >= LAST_SEEN_WRITE_MS) {
      presence.lastSeenWriteAt = now;
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date(now) },
      });
    }
    if (becameOnline) {
      await this.broadcastPresence(userId, true, new Date(now));
    }
  }

  private async markIdle(client: Socket, userId: string, lastActiveAt: Date) {
    const presence = client.data?.presence as SocketPresence | undefined;
    if (!presence?.active) {
      return;
    }
    presence.active = false;
    const becameOffline = await this.emitter.markInactive(userId, client.id);
    if (!becameOffline) {
      return;
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: lastActiveAt },
    });
    await this.broadcastPresence(userId, false, lastActiveAt);
  }

  /**
   * Keeps sockets of older app builds alive in the presence store, and turns off
   * sockets whose client stopped pinging (frozen tab, suspended app) so peers see it.
   */
  private async sweepPresence() {
    const now = Date.now();
    for (const client of this.server.sockets.values()) {
      const userId = client.data?.userId as string | undefined;
      const presence = client.data?.presence as SocketPresence | undefined;
      if (!userId || !presence?.active) continue;
      if (!presence.reportsActivity) {
        await this.markActive(client, userId);
      } else if (now - presence.lastPingAt >= PRESENCE_ACTIVE_TTL_MS) {
        await this.markIdle(client, userId, new Date(presence.lastPingAt));
      }
    }
  }

  @SubscribeMessage(REALTIME_EVENTS.TYPING_UPDATE)
  async handleTypingUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: unknown; typing?: unknown },
  ) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) {
      return;
    }

    const conversationId =
      typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
    if (!conversationId) {
      return;
    }

    const typing = body?.typing === true;
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      select: { conversationId: true },
    });
    if (!membership) {
      return;
    }

    const peers = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: userId },
      },
      select: { userId: true },
    });
    const peerIds = peers.map((row) => row.userId);
    if (peerIds.length === 0) {
      return;
    }

    const nickname =
      typeof client.data?.nickname === 'string' && client.data.nickname.trim()
        ? client.data.nickname.trim()
        : 'Участник';

    const payload: TypingUpdatePayload = {
      conversationId,
      userId,
      nickname,
      typing,
    };
    this.emitter.emitTypingUpdate(peerIds, payload);
  }

  private async broadcastPresence(userId: string, online: boolean, lastSeenAt: Date) {
    const memberships = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    if (memberships.length === 0) {
      return;
    }

    const peers = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId: { in: memberships.map((row) => row.conversationId) },
        userId: { not: userId },
      },
      select: { userId: true },
    });

    const peerIds = [...new Set(peers.map((row) => row.userId))];
    if (peerIds.length === 0) {
      return;
    }

    this.emitter.emitPresenceUpdate(peerIds, {
      userId,
      online,
      lastSeenAt: lastSeenAt.toISOString(),
    });
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    return null;
  }

  private async countUnreadChats(userId: string): Promise<number> {
    const memberships = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    if (memberships.length === 0) {
      return 0;
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: memberships.map((m) => m.conversationId) } },
      select: {
        id: true,
        lastMessageAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { senderId: true, createdAt: true },
        },
        reads: {
          where: { userId },
          select: { lastReadAt: true, hiddenAt: true },
        },
      },
    });

    let unread = 0;
    for (const conversation of conversations) {
      const last = conversation.messages[0];
      const hiddenAt = conversation.reads[0]?.hiddenAt;
      if (!last || last.senderId === userId) {
        continue;
      }
      if (hiddenAt && last.createdAt <= hiddenAt) {
        continue;
      }
      const lastReadAt = conversation.reads[0]?.lastReadAt;
      if (!lastReadAt || last.createdAt > lastReadAt) {
        unread += 1;
      }
    }
    return unread;
  }
}
