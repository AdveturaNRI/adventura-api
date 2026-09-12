import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';
import { REALTIME_EVENTS } from './realtime.events';
import { RealtimeEmitter } from './realtime.emitter';

type JwtPayload = {
  sub: string;
  email: string;
  nickname: string;
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server) {
    this.emitter.setServer(server);
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
        select: { id: true },
      });

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      await client.join(this.emitter.userRoom(user.id));

      const becameOnline = this.emitter.markOnline(user.id, client.id);
      const now = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: now },
      });

      if (becameOnline) {
        await this.broadcastPresence(user.id, true, now);
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

    const becameOffline = this.emitter.markOffline(userId, client.id);
    if (!becameOffline) {
      return;
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    });
    await this.broadcastPresence(userId, false, now);
    this.logger.debug(`WS disconnected user:${userId}`);
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
