import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConversationParticipantRole,
  ConversationType,
  MessageKind,
  WandererReactionType,
  Prisma,
  type Conversation,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AccessToken } from 'livekit-server-sdk';

import { ImageProcessorService } from '../image/image-processor.service';
import type { ImageUrls } from '../image/image.types';
import { ANALYTICS_EVENTS } from '../analytics/analytics.constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushSubscriptionsService } from '../push-subscriptions/push-subscriptions.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import type { CallInvitePayload } from '../realtime/realtime.events';
import { RewardsService } from '../rewards/rewards.service';
import {
  diceRollPreviewText,
  buildDicePayloadFromClient,
  parseDiceRollPayload,
  redactDiceRollPayload,
  rollDiceServerSide,
  serializeDiceRollPayload,
  validateDiceRollInput,
} from './dice-roll.util';
import type { SendDiceRollDto } from './dto/send-dice-roll.dto';

const MESSAGE_ATTACHMENT_COLLECTION = 'attachment';
const MESSAGE_ATTACHMENT_PREFIX = 'attachment-';
const MESSAGE_IMAGE_VARIANTS = ['thumb', 'medium', 'large', 'original'] as const;
const CHAT_BACKGROUND_IMAGE_VARIANTS = ['medium', 'large', 'original'] as const;
const MAX_MESSAGE_ATTACHMENTS = 10;
const MEMBERS_PREVIEW_LIMIT = 3;
/** Stop ringing callees; call stays open for late join. */
const VOICE_CALL_RING_MS = 30_000;
/** Solo lobby wait — initial invite and after others leave. */
const VOICE_CALL_WAIT_MS = 5 * 60_000;
/** After others leave, last person keeps the room this long. */
const VOICE_CALL_ABANDON_MS = VOICE_CALL_WAIT_MS;
/** Safety prune for abandoned solo lobbies. */
const VOICE_CALL_TTL_MS = VOICE_CALL_WAIT_MS + 30_000;

type ActiveVoiceCall = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromNickname: string;
  fromAvatarUrl: string | null;
  conversationTitle: string | null;
  isGroup: boolean;
  /** Still ringing — can accept / decline / join. */
  ringingUserIds: string[];
  /** Already in the LiveKit room (caller starts here). */
  joinedUserIds: string[];
  createdAt: number;
  ringTimer?: ReturnType<typeof setTimeout>;
  /** Ends the lobby if nobody else joined. */
  waitTimer?: ReturnType<typeof setTimeout>;
};

function toConversationBackground(row: {
  backgroundKind: string | null;
  backgroundPresetId: string | null;
  backgroundUrl: string | null;
}): ConversationBackgroundDto | null {
  const kind = row.backgroundKind;
  if (kind !== 'default' && kind !== 'preset' && kind !== 'custom') {
    return null;
  }
  return {
    kind,
    presetId: kind === 'preset' ? row.backgroundPresetId : null,
    url: kind === 'custom' ? row.backgroundUrl : null,
  };
}

export type ChatAttachmentKind = 'image' | 'audio' | 'file';

export type ChatPeer = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  badges: Array<'alpha_tester' | 'bug_hunter' | 'founding_dm' | 'early_arrival' | 'tavern_keeper'>;
  avatarFrameId: string | null;
};

export type ChatMember = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  online: boolean;
  lastSeenAt: string | null;
  badges: Array<'alpha_tester' | 'bug_hunter' | 'founding_dm' | 'early_arrival' | 'tavern_keeper'>;
  avatarFrameId: string | null;
};

export type ChatAttachmentDto = {
  kind: ChatAttachmentKind;
  name: string;
  mimeType: string;
  url: string | null;
  image: ImageUrls | null;
  durationSec: number | null;
  waveform: number[] | null;
};

export type ChatMessageKind =
  | 'user'
  | 'favorite_received'
  | 'favorite_removed'
  | 'user_blocked'
  | 'user_unblocked'
  | 'game_deleted'
  | 'dice_roll'
  | 'missed_voice_call';

export type ChatMessageSender = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  badges: Array<'alpha_tester' | 'bug_hunter' | 'founding_dm' | 'early_arrival' | 'tavern_keeper'>;
  avatarFrameId: string | null;
};

export type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  sender: ChatMessageSender;
  body: string | null;
  kind: ChatMessageKind;
  createdAt: string;
  image: ImageUrls | null;
  attachment: ChatAttachmentDto | null;
  attachments: ChatAttachmentDto[];
  replyTo: {
    id: string;
    body: string | null;
    senderNickname: string;
    hasMedia: boolean;
  } | null;
  forwardedFrom: {
    userId: string;
    nickname: string;
    messageId: string | null;
  } | null;
};

export type ConversationBackgroundDto = {
  kind: 'default' | 'preset' | 'custom';
  presetId: string | null;
  url: string | null;
};

export type ConversationListItem = {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  gameId: string | null;
  peer: ChatPeer | null;
  memberCount: number;
  membersPreview: ChatPeer[];
  peerLastReadAt: string | null;
  myRole?: 'owner' | 'admin' | 'member' | null;
  lastMessage: {
    id: string;
    body: string | null;
    senderId: string;
    createdAt: string;
    hasImage: boolean;
    attachmentKind: ChatAttachmentKind | null;
    kind: ChatMessageKind;
  } | null;
  unread: boolean;
  isFavorite: boolean;
  peerFavoritedMe: boolean;
  blockedByMe: boolean;
  blockedMe: boolean;
  isPinned: boolean;
  pinSortOrder: number | null;
  /** Shared wallpaper for all participants; null = personal settings. */
  background: ConversationBackgroundDto | null;
  updatedAt: string;
};

function toChatMemberRole(
  role: ConversationParticipantRole,
): 'owner' | 'admin' | 'member' {
  if (role === ConversationParticipantRole.OWNER) {
    return 'owner';
  }
  if (role === ConversationParticipantRole.ADMIN) {
    return 'admin';
  }
  return 'member';
}

function toChatMessageKind(kind: MessageKind | undefined): ChatMessageKind {
  if (kind === MessageKind.FAVORITE_RECEIVED) {
    return 'favorite_received';
  }
  if (kind === MessageKind.FAVORITE_REMOVED) {
    return 'favorite_removed';
  }
  if (kind === MessageKind.USER_BLOCKED) {
    return 'user_blocked';
  }
  if (kind === MessageKind.USER_UNBLOCKED) {
    return 'user_unblocked';
  }
  if (kind === MessageKind.GAME_DELETED) {
    return 'game_deleted';
  }
  if (kind === MessageKind.DICE_ROLL) {
    return 'dice_roll';
  }
  if (kind === MessageKind.MISSED_VOICE_CALL) {
    return 'missed_voice_call';
  }
  return 'user';
}

function attachmentKindFromMime(mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function isMessageAttachmentCollection(collection: string): boolean {
  return (
    collection === MESSAGE_ATTACHMENT_COLLECTION ||
    new RegExp(`^${MESSAGE_ATTACHMENT_PREFIX}\\d+$`).test(collection)
  );
}

function attachmentCollectionIndex(collection: string): number {
  if (collection === MESSAGE_ATTACHMENT_COLLECTION) {
    return 0;
  }
  const match = new RegExp(`^${MESSAGE_ATTACHMENT_PREFIX}(\\d+)$`).exec(collection);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function messageAttachmentCollection(index: number): string {
  return `${MESSAGE_ATTACHMENT_PREFIX}${index}`;
}

function orderedPair(userA: string, userB: string) {
  return userA < userB
    ? { userLowId: userA, userHighId: userB }
    : { userLowId: userB, userHighId: userA };
}

function isHiddenForUser(hiddenAt: Date | null | undefined, lastCreatedAt: Date | null) {
  if (!hiddenAt) {
    return false;
  }
  if (!lastCreatedAt) {
    return true;
  }
  return lastCreatedAt <= hiddenAt;
}

function sortConversationListItems(items: ConversationListItem[]): ConversationListItem[] {
  return [...items].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    if (left.isPinned && right.isPinned) {
      const leftOrder = left.pinSortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.pinSortOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

@Injectable()
export class ChatsService {
  private readonly activeVoiceCalls = new Map<string, ActiveVoiceCall>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly realtime: RealtimeEmitter,
    private readonly pushSubscriptions: PushSubscriptionsService,
    private readonly config: ConfigService,
    private readonly rewardsService: RewardsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async findOrCreateWith(userId: string, peerUserId: string) {
    if (userId === peerUserId) {
      throw new BadRequestException('Нельзя начать чат с собой');
    }

    const peer = await this.prisma.user.findUnique({
      where: { id: peerUserId },
      select: { id: true, nickname: true },
    });

    if (!peer) {
      throw new NotFoundException('Пользователь не найден');
    }

    const pair = orderedPair(userId, peerUserId);

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        userLowId_userHighId: pair,
      },
    });

    let created = false;

    if (!conversation) {
      created = true;
      conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          ...pair,
          participants: {
            create: [
              { userId, role: ConversationParticipantRole.MEMBER },
              { userId: peerUserId, role: ConversationParticipantRole.MEMBER },
            ],
          },
          reads: {
            create: [
              { userId, lastReadAt: new Date() },
              { userId: peerUserId, lastReadAt: new Date(0) },
            ],
          },
        },
      });
    } else {
      await this.ensureDirectParticipants(conversation.id, userId, peerUserId);
      await this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId },
        },
        create: { conversationId: conversation.id, userId, lastReadAt: new Date() },
        update: { hiddenAt: null },
      });
    }

    if (created) {
      this.analytics.track({
        name: ANALYTICS_EVENTS.PLAYER_PROFILE_CONTACTED,
        userId,
        props: {
          profile_user_id: peerUserId,
          conversation_id: conversation.id,
        },
      });
    }

    return this.getConversationSummary(userId, conversation.id);
  }

  async createGroup(userId: string, title: string, memberIds: string[]) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('Укажите название группы');
    }

    const otherIds = uniqueIds(memberIds.filter((id) => id && id !== userId));
    if (otherIds.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного участника');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true },
    });
    if (users.length !== otherIds.length) {
      throw new NotFoundException('Один или несколько пользователей не найдены');
    }

    const allMemberIds = [userId, ...otherIds];
    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: trimmedTitle,
        participants: {
          create: allMemberIds.map((id) => ({
            userId: id,
            role:
              id === userId
                ? ConversationParticipantRole.OWNER
                : ConversationParticipantRole.MEMBER,
          })),
        },
        reads: {
          create: allMemberIds.map((id) => ({
            userId: id,
            lastReadAt: id === userId ? new Date() : new Date(0),
          })),
        },
      },
    });

    const summaries = await Promise.all(
      allMemberIds.map((id) => this.getConversationSummary(id, conversation.id)),
    );
    for (let i = 0; i < allMemberIds.length; i += 1) {
      this.realtime.emitConversationUpdated([allMemberIds[i]], summaries[i]);
      this.realtime.emitUnreadSync(allMemberIds[i], {
        chats: await this.countUnreadChats(allMemberIds[i]),
        notifications: await this.countUnreadNotifications(allMemberIds[i]),
      });
    }

    return summaries[0];
  }

  async openGameChat(userId: string, gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        players: { select: { userId: true } },
      },
    });

    if (!game) {
      throw new NotFoundException('Игра не найдена');
    }

    const isOwner = game.ownerId === userId;
    const isPlayer = game.players.some((player) => player.userId === userId);
    if (!isOwner && !isPlayer) {
      throw new ForbiddenException('Нет доступа к чату игры');
    }

    const memberIds = uniqueIds([game.ownerId, ...game.players.map((p) => p.userId)]);

    let conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.GROUP,
          title: game.title,
          gameId: game.id,
          participants: {
            create: memberIds.map((id) => ({
              userId: id,
              role:
                id === game.ownerId
                  ? ConversationParticipantRole.OWNER
                  : ConversationParticipantRole.MEMBER,
            })),
          },
          reads: {
            create: memberIds.map((id) => ({
              userId: id,
              lastReadAt: id === userId ? new Date() : new Date(0),
            })),
          },
        },
      });

      const openerSummary = await this.getConversationSummary(userId, conversation.id);
      for (const memberId of memberIds) {
        if (memberId === userId) {
          continue;
        }
        const summary = await this.getConversationSummary(memberId, conversation.id);
        this.realtime.emitConversationUpdated([memberId], summary);
      }
      return openerSummary;
    }

    await this.syncGameChatMembers(conversation.id, game.ownerId, memberIds, game.title);

    await this.prisma.conversationRead.upsert({
      where: {
        conversationId_userId: { conversationId: conversation.id, userId },
      },
      create: { conversationId: conversation.id, userId, lastReadAt: new Date() },
      update: { hiddenAt: null },
    });

    return this.getConversationSummary(userId, conversation.id);
  }

  async listMembers(userId: string, conversationId: string): Promise<ChatMember[]> {
    await this.assertParticipant(userId, conversationId);

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: {
        user: { select: { id: true, nickname: true, lastSeenAt: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const looks = await this.rewardsService.getLooksForUsers(
      participants.map((participant) => participant.user.id),
    );

    return Promise.all(
      participants.map(async (participant) => {
        const look = looks.get(participant.user.id) ?? { badges: [], avatarFrameId: null };
        return {
          id: participant.user.id,
          nickname: participant.user.nickname,
          avatarUrl: await this.getAvatarUrl(participant.user.id),
          role: toChatMemberRole(participant.role),
          online: this.realtime.isPresent(participant.user.id, participant.user.lastSeenAt),
          lastSeenAt: participant.user.lastSeenAt?.toISOString() ?? null,
          badges: look.badges,
          avatarFrameId: look.avatarFrameId,
        };
      }),
    );
  }

  async renameGroup(userId: string, conversationId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new BadRequestException('Укажите название группы');
    }
    const { conversation } = await this.requireUserGroupStaff(userId, conversationId);
    if (conversation.gameId) {
      throw new BadRequestException('Название чата игры меняется вместе с игрой');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title: trimmed },
    });

    return this.emitGroupSummaries(conversationId);
  }

  async addGroupMembers(userId: string, conversationId: string, memberIds: string[]) {
    await this.requireUserGroupStaff(userId, conversationId);

    const otherIds = uniqueIds(memberIds.filter((id) => id && id !== userId));
    if (otherIds.length === 0) {
      throw new BadRequestException('Добавьте хотя бы одного участника');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true },
    });
    if (users.length !== otherIds.length) {
      throw new NotFoundException('Один или несколько пользователей не найдены');
    }

    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { in: otherIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((row) => row.userId));
    const toAdd = otherIds.filter((id) => !existingIds.has(id));
    if (toAdd.length === 0) {
      return this.listMembers(userId, conversationId);
    }

    await this.prisma.$transaction([
      this.prisma.conversationParticipant.createMany({
        data: toAdd.map((id) => ({
          conversationId,
          userId: id,
          role: ConversationParticipantRole.MEMBER,
        })),
        skipDuplicates: true,
      }),
      ...toAdd.map((id) =>
        this.prisma.conversationRead.upsert({
          where: {
            conversationId_userId: { conversationId, userId: id },
          },
          create: {
            conversationId,
            userId: id,
            lastReadAt: new Date(0),
            hiddenAt: null,
          },
          update: { hiddenAt: null },
        }),
      ),
    ]);

    await this.emitGroupSummaries(conversationId);
    return this.listMembers(userId, conversationId);
  }

  async removeGroupMember(actorId: string, conversationId: string, targetUserId: string) {
    const { membership: actor } = await this.requireUserGroupStaff(actorId, conversationId);
    if (targetUserId === actorId) {
      throw new BadRequestException('Чтобы выйти из группы, используйте «Выйти»');
    }

    const target = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });
    if (!target) {
      throw new NotFoundException('Участник не найден');
    }

    if (target.role === ConversationParticipantRole.OWNER) {
      throw new ForbiddenException('Нельзя исключить создателя группы');
    }
    if (
      actor.role === ConversationParticipantRole.ADMIN &&
      target.role !== ConversationParticipantRole.MEMBER
    ) {
      throw new ForbiddenException('Администратор может исключать только обычных участников');
    }

    await this.prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });

    this.realtime.emitConversationDeleted([targetUserId], { conversationId });
    this.realtime.emitUnreadSync(targetUserId, {
      chats: await this.countUnreadChats(targetUserId),
      notifications: await this.countUnreadNotifications(targetUserId),
    });

    await this.emitGroupSummaries(conversationId);
    return this.listMembers(actorId, conversationId);
  }

  async setGroupMemberRole(
    actorId: string,
    conversationId: string,
    targetUserId: string,
    role: 'admin' | 'member',
  ) {
    await this.requireUserGroupOwner(actorId, conversationId);
    if (targetUserId === actorId) {
      throw new BadRequestException('Нельзя изменить свою роль таким способом');
    }

    const target = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });
    if (!target) {
      throw new NotFoundException('Участник не найден');
    }
    if (target.role === ConversationParticipantRole.OWNER) {
      throw new ForbiddenException('Роль создателя меняется только передачей прав');
    }

    const nextRole =
      role === 'admin'
        ? ConversationParticipantRole.ADMIN
        : ConversationParticipantRole.MEMBER;

    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
      data: { role: nextRole },
    });

    await this.emitGroupSummaries(conversationId);
    return this.listMembers(actorId, conversationId);
  }

  async transferGroupOwnership(
    actorId: string,
    conversationId: string,
    targetUserId: string,
  ) {
    const trimmedTarget = targetUserId.trim();
    if (!trimmedTarget) {
      throw new BadRequestException('Укажите участника');
    }
    await this.requireUserGroupOwner(actorId, conversationId);
    if (trimmedTarget === actorId) {
      throw new BadRequestException('Вы уже создатель группы');
    }

    const target = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: trimmedTarget },
      },
    });
    if (!target) {
      throw new NotFoundException('Участник не найден');
    }

    await this.prisma.$transaction([
      this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: { conversationId, userId: trimmedTarget },
        },
        data: { role: ConversationParticipantRole.OWNER },
      }),
      this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: { conversationId, userId: actorId },
        },
        data: { role: ConversationParticipantRole.ADMIN },
      }),
    ]);

    await this.emitGroupSummaries(conversationId);
    return this.listMembers(actorId, conversationId);
  }

  async deleteGroup(userId: string, conversationId: string) {
    const { conversation } = await this.requireUserGroupOwner(userId, conversationId);
    if (conversation.gameId) {
      throw new BadRequestException('Чат игры удаляется вместе с игрой');
    }

    const participantIds = await this.getParticipantIds(conversationId);
    await this.deleteConversationMedia(conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });

    for (const id of participantIds) {
      this.realtime.emitConversationDeleted([id], { conversationId });
      this.realtime.emitUnreadSync(id, {
        chats: await this.countUnreadChats(id),
        notifications: await this.countUnreadNotifications(id),
      });
    }

    return { ok: true as const };
  }

  private async emitGroupSummaries(conversationId: string) {
    const participantIds = await this.getParticipantIds(conversationId);
    const summaries = await Promise.all(
      participantIds.map((id) => this.getConversationSummary(id, conversationId)),
    );
    for (let i = 0; i < participantIds.length; i += 1) {
      this.realtime.emitConversationUpdated([participantIds[i]], summaries[i]);
    }
    return summaries[0] ?? null;
  }

  private async requireUserGroupStaff(userId: string, conversationId: string) {
    const conversation = await this.assertParticipant(userId, conversationId);
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Это не групповой чат');
    }
    if (conversation.gameId) {
      throw new BadRequestException('Состав чата игры меняется через игру');
    }
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (
      !membership ||
      (membership.role !== ConversationParticipantRole.OWNER &&
        membership.role !== ConversationParticipantRole.ADMIN)
    ) {
      throw new ForbiddenException('Нужны права администратора');
    }
    return { conversation, membership };
  }

  private async requireUserGroupOwner(userId: string, conversationId: string) {
    const conversation = await this.assertParticipant(userId, conversationId);
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Это не групповой чат');
    }
    if (conversation.gameId) {
      throw new BadRequestException('Состав чата игры меняется через игру');
    }
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!membership || membership.role !== ConversationParticipantRole.OWNER) {
      throw new ForbiddenException('Только создатель группы');
    }
    return { conversation, membership };
  }

  async leaveGroup(userId: string, conversationId: string) {
    const conversation = await this.assertParticipant(userId, conversationId);

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Из личного чата нельзя выйти — удалите его');
    }

    // Game chats: hide for self, keep roster in sync with the game.
    if (conversation.gameId) {
      const now = new Date();
      await this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        create: { conversationId, userId, lastReadAt: now, hiddenAt: now },
        update: { hiddenAt: now, lastReadAt: now },
      });
      this.realtime.emitConversationDeleted([userId], { conversationId });
      this.realtime.emitUnreadSync(userId, {
        chats: await this.countUnreadChats(userId),
        notifications: await this.countUnreadNotifications(userId),
      });
      return { ok: true as const };
    }

    const remaining = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true, role: true, joinedAt: true },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const leaving = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      select: { role: true },
    });

    // If the owner leaves, hand ownership to the next admin (or earliest member).
    if (
      leaving?.role === ConversationParticipantRole.OWNER &&
      remaining.length > 0
    ) {
      const nextOwner =
        remaining.find((row) => row.role === ConversationParticipantRole.ADMIN) ??
        remaining[0];
      await this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: nextOwner.userId,
          },
        },
        data: { role: ConversationParticipantRole.OWNER },
      });
    }

    await this.prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    this.realtime.emitConversationDeleted([userId], { conversationId });
    this.realtime.emitUnreadSync(userId, {
      chats: await this.countUnreadChats(userId),
      notifications: await this.countUnreadNotifications(userId),
    });

    if (remaining.length === 0) {
      await this.deleteConversationMedia(conversationId);
      await this.prisma.conversation.delete({ where: { id: conversationId } });
      return { ok: true as const };
    }

    await Promise.all(
      remaining.map(async (row) => {
        const summary = await this.getConversationSummary(row.userId, conversationId);
        this.realtime.emitConversationUpdated([row.userId], summary);
      }),
    );

    return { ok: true as const };
  }

  /**
   * Called from GamesService when a player is accepted into a game that already has a chat.
   */
  async addGameChatParticipant(gameId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    await this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: { conversationId: conversation.id, userId },
      },
      create: {
        conversationId: conversation.id,
        userId,
        role: ConversationParticipantRole.MEMBER,
      },
      update: {},
    });
    await this.prisma.conversationRead.upsert({
      where: {
        conversationId_userId: { conversationId: conversation.id, userId },
      },
      create: {
        conversationId: conversation.id,
        userId,
        lastReadAt: new Date(0),
      },
      update: { hiddenAt: null },
    });

    const participantIds = await this.getParticipantIds(conversation.id);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversation.id);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
  }

  /**
   * Called from GamesService when a player is removed from a game that already has a chat.
   */
  async removeGameChatParticipant(gameId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    // Never remove the game owner from the chat via player removal.
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { ownerId: true },
    });
    if (game?.ownerId === userId) {
      return;
    }

    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId: conversation.id, userId },
    });

    this.realtime.emitConversationDeleted([userId], { conversationId: conversation.id });
    this.realtime.emitUnreadSync(userId, {
      chats: await this.countUnreadChats(userId),
      notifications: await this.countUnreadNotifications(userId),
    });

    const participantIds = await this.getParticipantIds(conversation.id);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversation.id);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
  }


  /**
   * System notice in the game group chat when the master deletes the game.
   * Call before detaching/deleting the conversation.
   */
  async postGameDeletedMessage(ownerId: string, gameId: string, gameTitle: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return null;
    }

    const conversationId = conversation.id;
    const title = gameTitle.trim() || 'Игра';
    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: ownerId,
        body: `удалил игру «${title}».`,
        kind: MessageKind.GAME_DELETED,
      },
    });

    const participantIds = await this.getParticipantIds(conversationId);

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: ownerId },
        },
        create: { conversationId, userId: ownerId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      ...participantIds
        .filter((id) => id !== ownerId)
        .map((id) =>
          this.prisma.conversationRead.upsert({
            where: {
              conversationId_userId: { conversationId, userId: id },
            },
            create: {
              conversationId,
              userId: id,
              lastReadAt: new Date(0),
              hiddenAt: null,
            },
            update: { hiddenAt: null },
          }),
        ),
    ]);

    const dto = await this.toMessageDto(message);
    this.realtime.emitMessageNew(participantIds, dto);

    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversationId);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );

    await this.emitUnreadForUsers(participantIds);
    return dto;
  }

  /** Unlink chat from game so it survives game deletion. */
  async detachGameChat(gameId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { gameId: null },
    });

    const participantIds = await this.getParticipantIds(conversation.id);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversation.id);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
  }

  /** Hard-delete the game group chat for everyone. */
  async deleteGameChat(gameId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    const conversationId = conversation.id;
    const participantIds = await this.getParticipantIds(conversationId);
    await this.deleteConversationMedia(conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    this.realtime.emitConversationDeleted(participantIds, { conversationId });
    await this.emitUnreadForUsers(participantIds);
  }

  async renameGameChat(gameId: string, title: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { title },
    });

    const participantIds = await this.getParticipantIds(conversation.id);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversation.id);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
  }

  async postFavoriteReceivedMessage(actorId: string, targetUserId: string) {
    const summary = await this.findOrCreateWith(actorId, targetUserId);
    const conversationId = summary.id;

    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: actorId,
        body: 'добавил вас в избранные.',
        kind: MessageKind.FAVORITE_RECEIVED,
      },
    });

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: actorId },
        },
        create: { conversationId, userId: actorId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: targetUserId },
        },
        create: { conversationId, userId: targetUserId, lastReadAt: new Date(0), hiddenAt: null },
        update: { hiddenAt: null },
      }),
    ]);

    const dto = await this.toMessageDto(message);
    const summaryForActor = await this.getConversationSummary(actorId, conversationId);
    const summaryForTarget = await this.getConversationSummary(targetUserId, conversationId);

    this.realtime.emitMessageNew([actorId, targetUserId], dto);
    this.realtime.emitConversationUpdated([actorId], summaryForActor);
    this.realtime.emitConversationUpdated([targetUserId], summaryForTarget);

    await this.emitUnreadForUsers([actorId, targetUserId]);

    return dto;
  }

  /**
   * System notice when someone removes a favorite. Chat-only — no portal notification.
   */
  async postFavoriteRemovedMessage(actorId: string, targetUserId: string) {
    const pair = orderedPair(actorId, targetUserId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { userLowId_userHighId: pair },
      select: { id: true },
    });
    if (!conversation) {
      return null;
    }

    const conversationId = conversation.id;
    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: actorId,
        body: 'убрал вас из избранных.',
        kind: MessageKind.FAVORITE_REMOVED,
      },
    });

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: actorId },
        },
        create: { conversationId, userId: actorId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: targetUserId },
        },
        create: { conversationId, userId: targetUserId, lastReadAt: new Date(0), hiddenAt: null },
        update: { hiddenAt: null },
      }),
    ]);

    const dto = await this.toMessageDto(message);
    const summaryForActor = await this.getConversationSummary(actorId, conversationId);
    const summaryForTarget = await this.getConversationSummary(targetUserId, conversationId);

    this.realtime.emitMessageNew([actorId, targetUserId], dto);
    this.realtime.emitConversationUpdated([actorId], summaryForActor);
    this.realtime.emitConversationUpdated([targetUserId], summaryForTarget);

    await this.emitUnreadForUsers([actorId, targetUserId]);

    return dto;
  }

  async blockPeer(userId: string, conversationId: string) {
    const conversation = await this.assertDirectConversation(userId, conversationId);
    const peerId = this.directPeerId(conversation, userId);

    const existing = await this.prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: { blockerId: userId, blockedId: peerId },
      },
      select: { id: true },
    });
    if (existing) {
      return this.getConversationSummary(userId, conversationId);
    }

    await this.prisma.userBlock.create({
      data: { blockerId: userId, blockedId: peerId },
    });

    await this.prisma.wandererReaction.upsert({
      where: {
        viewerId_targetUserId: {
          viewerId: userId,
          targetUserId: peerId,
        },
      },
      create: {
        viewerId: userId,
        targetUserId: peerId,
        type: WandererReactionType.SKIPPED,
      },
      update: {
        type: WandererReactionType.SKIPPED,
      },
    });

    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: 'заблокировал пользователя.',
        kind: MessageKind.USER_BLOCKED,
      },
    });

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        create: { conversationId, userId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: peerId },
        },
        create: { conversationId, userId: peerId, lastReadAt: new Date(0), hiddenAt: null },
        update: { hiddenAt: null },
      }),
    ]);

    const dto = await this.toMessageDto(message);
    this.realtime.emitMessageNew([userId, peerId], dto);

    const summaryForActor = await this.getConversationSummary(userId, conversationId);
    const summaryForPeer = await this.getConversationSummary(peerId, conversationId);

    this.realtime.emitConversationUpdated([userId], summaryForActor);
    this.realtime.emitConversationUpdated([peerId], summaryForPeer);

    await this.emitUnreadForUsers([userId, peerId]);

    return summaryForActor;
  }

  async unblockPeer(userId: string, conversationId: string) {
    const conversation = await this.assertDirectConversation(userId, conversationId);
    const peerId = this.directPeerId(conversation, userId);

    const deleted = await this.prisma.userBlock.deleteMany({
      where: { blockerId: userId, blockedId: peerId },
    });
    if (deleted.count === 0) {
      return this.getConversationSummary(userId, conversationId);
    }

    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: 'разблокировал вас.',
        kind: MessageKind.USER_UNBLOCKED,
      },
    });

    const peerRead = await this.prisma.conversationRead.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: peerId },
      },
      select: { hiddenAt: true },
    });
    const peerStaysHidden = Boolean(peerRead?.hiddenAt);

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        create: { conversationId, userId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: peerId },
        },
        create: {
          conversationId,
          userId: peerId,
          lastReadAt: new Date(0),
          hiddenAt: null,
        },
        update: peerStaysHidden ? { hiddenAt: now } : {},
      }),
    ]);

    const dto = await this.toMessageDto(message);
    this.realtime.emitMessageNew(peerStaysHidden ? [userId] : [userId, peerId], dto);

    const summaryForActor = await this.getConversationSummary(userId, conversationId);
    this.realtime.emitConversationUpdated([userId], summaryForActor);

    if (!peerStaysHidden) {
      const summaryForPeer = await this.getConversationSummary(peerId, conversationId);
      this.realtime.emitConversationUpdated([peerId], summaryForPeer);
    } else {
      this.realtime.emitConversationDeleted([peerId], { conversationId });
    }

    await this.emitUnreadForUsers([userId, peerId]);

    return summaryForActor;
  }

  async unblockPeerByUserId(userId: string, peerUserId: string) {
    const summary = await this.findOrCreateWith(userId, peerUserId);
    return this.unblockPeer(userId, summary.id);
  }

  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const memberships = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const conversationIds = memberships.map((row) => row.conversationId);
    if (conversationIds.length === 0) {
      return [];
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        reads: true,
        participants: {
          include: {
            user: { select: { id: true, nickname: true, lastSeenAt: true } },
          },
        },
        userLow: { select: { id: true, nickname: true, lastSeenAt: true } },
        userHigh: { select: { id: true, nickname: true, lastSeenAt: true } },
      },
    });

    const favoriteRows = await this.prisma.wandererReaction.findMany({
      where: { viewerId: userId, type: 'FAVORITE' },
      select: { targetUserId: true },
    });
    const favoriteIds = new Set(favoriteRows.map((row) => row.targetUserId));
    const favoritedMeRows = await this.prisma.wandererReaction.findMany({
      where: { targetUserId: userId, type: 'FAVORITE' },
      select: { viewerId: true },
    });
    const favoritedMeIds = new Set(favoritedMeRows.map((row) => row.viewerId));
    const blockRows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });

    const items: ConversationListItem[] = [];

    for (const conversation of conversations) {
      const myRead = conversation.reads.find((read) => read.userId === userId);
      const last = conversation.messages[0] ?? null;
      if (isHiddenForUser(myRead?.hiddenAt, last?.createdAt ?? null)) {
        continue;
      }

      let attachmentKind: ChatAttachmentKind | null = null;
      if (last) {
        attachmentKind = await this.getMessageAttachmentKind(last.id);
      }

      const lastReadAt = myRead?.lastReadAt;
      const unread = Boolean(
        last &&
          last.senderId !== userId &&
          (!lastReadAt || last.createdAt > lastReadAt),
      );

      const lastMessage = last
        ? {
            id: last.id,
            body: this.previewBodyForViewer(last.body, last.kind, last.senderId, userId),
            senderId: last.senderId,
            createdAt: last.createdAt.toISOString(),
            hasImage: attachmentKind === 'image',
            attachmentKind,
            kind: toChatMessageKind(last.kind),
          }
        : null;

      if (conversation.type === ConversationType.GROUP) {
        const previewUsers = conversation.participants
          .filter((p) => p.userId !== userId)
          .slice(0, MEMBERS_PREVIEW_LIMIT)
          .map((p) => p.user);
        const myParticipant = conversation.participants.find((p) => p.userId === userId);
        items.push({
          id: conversation.id,
          type: 'group',
          title: conversation.title,
          gameId: conversation.gameId,
          peer: null,
          memberCount: conversation.participants.length,
          membersPreview: await Promise.all(previewUsers.map((user) => this.toPeerDto(user))),
          peerLastReadAt: null,
          myRole: myParticipant ? toChatMemberRole(myParticipant.role) : null,
          lastMessage,
          unread,
          isFavorite: false,
          peerFavoritedMe: false,
          blockedByMe: false,
          blockedMe: false,
          isPinned: Boolean(myRead?.pinnedAt),
          pinSortOrder: myRead?.pinSortOrder ?? null,
          background: toConversationBackground(conversation),
          updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
        });
        continue;
      }

      const peerUser =
        conversation.userLowId === userId
          ? conversation.userHigh
          : conversation.userLow;
      if (!peerUser) {
        continue;
      }

      const peerRead = conversation.reads.find((read) => read.userId === peerUser.id);
      const blockedByMe = blockRows.some(
        (row) => row.blockerId === userId && row.blockedId === peerUser.id,
      );
      const blockedMe = blockRows.some(
        (row) => row.blockerId === peerUser.id && row.blockedId === userId,
      );

      items.push({
        id: conversation.id,
        type: 'direct',
        title: null,
        gameId: null,
        peer: await this.toPeerDto(peerUser),
        memberCount: 2,
        membersPreview: [],
        peerLastReadAt: peerRead?.lastReadAt.toISOString() ?? null,
        lastMessage,
        unread,
        isFavorite: favoriteIds.has(peerUser.id) && !blockedByMe && !blockedMe,
        peerFavoritedMe: favoritedMeIds.has(peerUser.id) && !blockedByMe && !blockedMe,
        blockedByMe,
        blockedMe,
        isPinned: Boolean(myRead?.pinnedAt),
        pinSortOrder: myRead?.pinSortOrder ?? null,
        background: toConversationBackground(conversation),
        updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
      });
    }

    return sortConversationListItems(items);
  }

  async pinConversation(userId: string, conversationId: string): Promise<ConversationListItem> {
    await this.assertParticipant(userId, conversationId);

    const existing = await this.prisma.conversationRead.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { pinnedAt: true, pinSortOrder: true },
    });
    if (existing?.pinnedAt) {
      return this.getConversationSummary(userId, conversationId);
    }

    const maxPinned = await this.prisma.conversationRead.aggregate({
      where: { userId, pinnedAt: { not: null } },
      _max: { pinSortOrder: true },
    });
    const nextOrder = (maxPinned._max.pinSortOrder ?? -1) + 1;
    const now = new Date();

    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: {
        conversationId,
        userId,
        lastReadAt: now,
        pinnedAt: now,
        pinSortOrder: nextOrder,
      },
      update: {
        pinnedAt: now,
        pinSortOrder: nextOrder,
        hiddenAt: null,
      },
    });

    const summary = await this.getConversationSummary(userId, conversationId);
    this.realtime.emitConversationUpdated([userId], summary);
    return summary;
  }

  async unpinConversation(userId: string, conversationId: string): Promise<ConversationListItem> {
    await this.assertParticipant(userId, conversationId);

    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: {
        conversationId,
        userId,
        lastReadAt: new Date(),
        pinnedAt: null,
        pinSortOrder: null,
      },
      update: {
        pinnedAt: null,
        pinSortOrder: null,
      },
    });

    const remaining = await this.prisma.conversationRead.findMany({
      where: { userId, pinnedAt: { not: null } },
      orderBy: [{ pinSortOrder: 'asc' }, { pinnedAt: 'asc' }],
      select: { conversationId: true },
    });
    await Promise.all(
      remaining.map((row, index) =>
        this.prisma.conversationRead.update({
          where: {
            conversationId_userId: { conversationId: row.conversationId, userId },
          },
          data: { pinSortOrder: index },
        }),
      ),
    );

    const summary = await this.getConversationSummary(userId, conversationId);
    this.realtime.emitConversationUpdated([userId], summary);
    return summary;
  }

  async reorderPinnedConversations(
    userId: string,
    conversationIds: string[],
  ): Promise<ConversationListItem[]> {
    const unique = uniqueIds(conversationIds.map((id) => id.trim()).filter(Boolean));
    if (unique.length === 0) {
      throw new BadRequestException('Нечего упорядочивать');
    }

    const pinned = await this.prisma.conversationRead.findMany({
      where: { userId, pinnedAt: { not: null } },
      select: { conversationId: true },
    });
    const pinnedIds = new Set(pinned.map((row) => row.conversationId));
    if (unique.some((id) => !pinnedIds.has(id))) {
      throw new BadRequestException('Можно менять порядок только у закреплённых чатов');
    }
    if (unique.length !== pinnedIds.size) {
      throw new BadRequestException('Передайте все закреплённые чаты в новом порядке');
    }

    await this.prisma.$transaction(
      unique.map((conversationId, index) =>
        this.prisma.conversationRead.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: { pinSortOrder: index },
        }),
      ),
    );

    return this.listConversations(userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 40,
  ) {
    const conversation = await this.assertParticipant(userId, conversationId);

    const myRead = await this.prisma.conversationRead.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      select: { hiddenAt: true },
    });

    let cursorCreatedAt: Date | undefined;
    if (cursor) {
      const cursorMessage = await this.prisma.message.findFirst({
        where: { id: cursor, conversationId },
        select: { createdAt: true },
      });
      cursorCreatedAt = cursorMessage?.createdAt;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursorCreatedAt || myRead?.hiddenAt
          ? {
              createdAt: {
                ...(myRead?.hiddenAt ? { gt: myRead.hiddenAt } : {}),
                ...(cursorCreatedAt ? { lt: cursorCreatedAt } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const dtos = await Promise.all(
      page.map((message) => this.toMessageDto(message, userId)),
    );

    if (conversation.type === ConversationType.GROUP) {
      return {
        items: dtos.reverse(),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        peerLastReadAt: null,
        blockedByMe: false,
        blockedMe: false,
      };
    }

    const peerId = this.directPeerId(conversation, userId);
    const peerRead = await this.prisma.conversationRead.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: peerId },
      },
      select: { lastReadAt: true },
    });

    return {
      items: dtos.reverse(),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      peerLastReadAt: peerRead?.lastReadAt.toISOString() ?? null,
      ...(await this.getBlockFlags(userId, peerId)),
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    body: string | undefined,
    files: Express.Multer.File[] = [],
    replyToId?: string,
    voice?: { voiceDurationSec?: number; voiceWaveform?: string },
  ) {
    const conversation = await this.assertParticipant(userId, conversationId);
    const participantIds = await this.getParticipantIds(conversationId);

    if (conversation.type === ConversationType.DIRECT) {
      const peerId = this.directPeerId(conversation, userId);
      const blockedMe = await this.prisma.userBlock.findUnique({
        where: {
          blockerId_blockedId: { blockerId: peerId, blockedId: userId },
        },
        select: { id: true },
      });
      if (blockedMe) {
        throw new ForbiddenException('Вас заблокировали. Отправлять сообщения нельзя.');
      }
    }

    const trimmed = body?.trim() || null;
    const uploads = files.filter(Boolean);

    if (uploads.length > MAX_MESSAGE_ATTACHMENTS) {
      throw new BadRequestException(
        `Можно отправить не более ${MAX_MESSAGE_ATTACHMENTS} файлов за раз`,
      );
    }

    if (!trimmed && uploads.length === 0) {
      throw new BadRequestException('Сообщение не может быть пустым');
    }

    const replyMeta = await this.resolveReplyMeta(conversationId, replyToId);
    const attachmentName = uploads[0]?.originalname?.trim() || null;
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: trimmed,
        attachmentName,
        ...(replyMeta
          ? {
              replyToId: replyMeta.id,
              replyToBody: replyMeta.body,
              replyToSenderNickname: replyMeta.senderNickname,
              replyToHasMedia: replyMeta.hasMedia,
            }
          : {}),
      },
    });

    for (let index = 0; index < uploads.length; index += 1) {
      const file = uploads[index];
      const entity = {
        entityType: 'Message',
        entityId: message.id,
        collection: messageAttachmentCollection(index),
      };
      const kind = attachmentKindFromMime(file.mimetype);

      if (kind === 'image') {
        const variants = await this.imageProcessor.processImage(
          file.buffer,
          file.mimetype,
          [...MESSAGE_IMAGE_VARIANTS],
        );
        await this.mediaService.replaceCollection(entity, variants);
      } else {
        const isVoice = kind === 'audio' && uploads.length === 1 && Boolean(voice?.voiceDurationSec);
        await this.mediaService.saveRawFile(entity, file.buffer, file.mimetype, {
          fileName: file.originalname?.trim() || attachmentName || undefined,
          durationSec: isVoice ? voice?.voiceDurationSec : null,
          waveform: isVoice ? this.parseVoiceWaveform(voice?.voiceWaveform) : null,
        });
      }
    }

    await this.afterMessageCreated(userId, conversationId, participantIds, message.id);
    return this.toMessageDto(message, userId);
  }

  async sendDiceRoll(userId: string, conversationId: string, dto: SendDiceRollDto) {
    const conversation = await this.assertParticipant(userId, conversationId);
    const participantIds = await this.getParticipantIds(conversationId);

    if (conversation.type === ConversationType.DIRECT) {
      const peerId = this.directPeerId(conversation, userId);
      const blockedMe = await this.prisma.userBlock.findUnique({
        where: {
          blockerId_blockedId: { blockerId: peerId, blockedId: userId },
        },
        select: { id: true },
      });
      if (blockedMe) {
        throw new ForbiddenException('Вас заблокировали. Отправлять сообщения нельзя.');
      }
    }

    const modifier = dto.modifier ?? 0;
    const mode = dto.mode ?? 'normal';
    const validationError = validateDiceRollInput(dto.dice, modifier, mode);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    const payload =
      dto.groups && dto.groups.length > 0
        ? (() => {
            const built = buildDicePayloadFromClient(
              dto.dice,
              dto.groups,
              modifier,
              dto.color,
              mode,
              dto.skin,
            );
            if (typeof built === 'string') {
              throw new BadRequestException(built);
            }
            return built;
          })()
        : rollDiceServerSide(dto.dice, modifier, dto.color, mode, dto.skin);
    payload.hidden = Boolean(dto.hidden);
    const ownedSkin = await this.rewardsService.resolveOwnedDiceSkin(userId, dto.skin);
    if (ownedSkin) {
      payload.skin = ownedSkin;
    } else {
      delete payload.skin;
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: serializeDiceRollPayload(payload),
        kind: MessageKind.DICE_ROLL,
      },
    });

    await this.afterMessageCreated(userId, conversationId, participantIds, message.id);
    return this.toMessageDto(message, userId);
  }

  async forwardMessages(
    userId: string,
    targetConversationId: string,
    messageIds: string[],
  ): Promise<ChatMessageDto[]> {
    await this.assertParticipant(userId, targetConversationId);
    const uniqueIds = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Нечего пересылать');
    }
    if (uniqueIds.length > 20) {
      throw new BadRequestException('За раз можно переслать не больше 20 сообщений');
    }

    const sources = await this.prisma.message.findMany({
      where: {
        id: { in: uniqueIds },
        kind: { in: [MessageKind.USER, MessageKind.DICE_ROLL] },
      },
      include: {
        sender: { select: { id: true, nickname: true } },
      },
    });

    if (sources.length !== uniqueIds.length) {
      throw new NotFoundException('Часть сообщений не найдена');
    }

    const byId = new Map(sources.map((item) => [item.id, item]));
    const ordered = uniqueIds.map((id) => byId.get(id)!);

    const sourceConversationIds = [...new Set(ordered.map((item) => item.conversationId))];
    await Promise.all(
      sourceConversationIds.map((id) => this.assertParticipant(userId, id)),
    );

    const target = await this.assertParticipant(userId, targetConversationId);
    if (target.type === ConversationType.DIRECT) {
      const peerId = this.directPeerId(target, userId);
      const blockedMe = await this.prisma.userBlock.findUnique({
        where: {
          blockerId_blockedId: { blockerId: peerId, blockedId: userId },
        },
        select: { id: true },
      });
      if (blockedMe) {
        throw new ForbiddenException('Вас заблокировали. Отправлять сообщения нельзя.');
      }
    }

    const participantIds = await this.getParticipantIds(targetConversationId);
    const created: ChatMessageDto[] = [];

    for (const source of ordered) {
      const hasMedia =
        Boolean(source.attachmentName) ||
        (await this.prisma.media.count({
          where: { entityType: 'Message', entityId: source.id },
        })) > 0;

      if (!source.body?.trim() && !hasMedia) {
        continue;
      }

      let body = source.body;
      if (source.kind === MessageKind.DICE_ROLL) {
        const payload = parseDiceRollPayload(source.body);
        if (!payload) {
          continue;
        }
        // Чужой скрытый бросок нельзя «раскрыть» пересылкой — уходит только заглушка.
        if (payload.hidden && source.senderId !== userId) {
          body = serializeDiceRollPayload(redactDiceRollPayload(payload));
        }
      }

      const message = await this.prisma.message.create({
        data: {
          conversationId: targetConversationId,
          senderId: userId,
          body,
          attachmentName: source.attachmentName,
          kind: source.kind,
          forwardedFromUserId: source.senderId,
          forwardedFromNickname: source.sender.nickname,
          forwardedFromMessageId: source.id,
        },
      });

      if (hasMedia) {
        await this.mediaService.copyEntityMedia(
          { entityType: 'Message', entityId: source.id },
          { entityType: 'Message', entityId: message.id },
        );
      }

      await this.afterMessageCreated(userId, targetConversationId, participantIds, message.id);
      created.push(await this.toMessageDto(message, userId));
    }

    if (created.length === 0) {
      throw new BadRequestException('Нечего пересылать');
    }

    return created;
  }

  private async resolveReplyMeta(conversationId: string, replyToId?: string) {
    const id = replyToId?.trim();
    if (!id) {
      return null;
    }

    const replyTo = await this.prisma.message.findFirst({
      where: {
        id,
        conversationId,
        kind: { in: [MessageKind.USER, MessageKind.DICE_ROLL] },
      },
      include: { sender: { select: { nickname: true } } },
    });
    if (!replyTo) {
      throw new BadRequestException('Сообщение для ответа не найдено в этом чате');
    }

    const hasMedia =
      Boolean(replyTo.attachmentName) ||
      (await this.prisma.media.count({
        where: { entityType: 'Message', entityId: replyTo.id },
      })) > 0;

    let body = replyTo.body;
    if (replyTo.kind === MessageKind.DICE_ROLL) {
      const payload = parseDiceRollPayload(replyTo.body);
      body = diceRollPreviewText(payload, { isSender: true });
    }

    return {
      id: replyTo.id,
      body,
      senderNickname: replyTo.sender.nickname,
      hasMedia,
    };
  }

  private async afterMessageCreated(
    userId: string,
    conversationId: string,
    participantIds: string[],
    messageId: string,
  ) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        create: { conversationId, userId, lastReadAt: now },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      ...participantIds
        .filter((id) => id !== userId)
        .map((id) =>
          this.prisma.conversationRead.upsert({
            where: {
              conversationId_userId: { conversationId, userId: id },
            },
            create: {
              conversationId,
              userId: id,
              lastReadAt: new Date(0),
              hiddenAt: null,
            },
            update: { hiddenAt: null },
          }),
        ),
    ]);

    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
    });

    await Promise.all(
      participantIds.map(async (id) => {
        const dto = await this.toMessageDto(message, id);
        this.realtime.emitMessageNew([id], dto);
      }),
    );

    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversationId);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );

    await this.emitUnreadForUsers(participantIds);
    void this.pushNewChatMessage(userId, conversationId, participantIds, message);
  }

  private async pushNewChatMessage(
    senderId: string,
    conversationId: string,
    participantIds: string[],
    message: {
      body: string | null;
      kind: MessageKind;
      attachmentName: string | null;
    },
  ) {
    const kind = toChatMessageKind(message.kind);
    if (kind !== 'user' && kind !== 'dice_roll') {
      return;
    }

    const recipients = participantIds.filter((id) => id !== senderId);
    if (recipients.length === 0) {
      return;
    }

    const [sender, conversation] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { nickname: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, title: true },
      }),
    ]);

    const senderName = sender?.nickname?.trim() || 'Сообщение';
    const isGroup = conversation?.type === ConversationType.GROUP;
    const title =
      isGroup && conversation?.title?.trim()
        ? conversation.title.trim()
        : senderName;

    let body: string;
    if (kind === 'dice_roll') {
      body = `${senderName}: бросок кубиков`;
    } else if (message.body?.trim()) {
      body = isGroup ? `${senderName}: ${message.body.trim()}` : message.body.trim();
    } else if (message.attachmentName) {
      body = isGroup ? `${senderName}: вложение` : 'Вложение';
    } else {
      body = isGroup ? `${senderName}: новое сообщение` : 'Новое сообщение';
    }

    const payload = {
      title,
      body,
      tag: `chat:${conversationId}`,
      url: `/chats/${encodeURIComponent(conversationId)}`,
    };

    await Promise.all(recipients.map((id) => this.pushSubscriptions.sendToUser(id, payload)));
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    const now = new Date();

    await this.prisma.conversationRead.upsert({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      create: { conversationId, userId, lastReadAt: now },
      update: { lastReadAt: now },
    });

    const participantIds = await this.getParticipantIds(conversationId);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversationId);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
    this.realtime.emitConversationRead(participantIds, {
      conversationId,
      readerId: userId,
      lastReadAt: now.toISOString(),
    });
    this.realtime.emitUnreadSync(userId, {
      chats: await this.countUnreadChats(userId),
      notifications: await this.countUnreadNotifications(userId),
    });

    return { ok: true as const };
  }

  /** Join token for LiveKit voice room keyed by conversation id. */
  async createVoiceToken(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);

    const url = this.config.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET')?.trim();

    if (!url || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Голосовой чат пока не настроен');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });

    const roomName = `chat:${conversationId}`;
    const avatarUrl = await this.getAvatarUrl(userId, 'display');
    const look =
      (await this.rewardsService.getLooksForUsers([userId])).get(userId) ?? {
        badges: [],
        avatarFrameId: null,
      };
    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: user?.nickname ?? userId,
      metadata: JSON.stringify({
        avatarUrl,
        badges: look.badges,
        avatarFrameId: look.avatarFrameId,
      }),
      ttl: '2h',
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      url,
      token: await token.toJwt(),
      roomName,
    };
  }

  async inviteVoiceCall(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    this.pruneExpiredVoiceCalls();

    if (this.findActiveCallForConversation(conversationId)) {
      throw new BadRequestException('В этом чате уже идёт звонок');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, title: true },
    });
    if (!conversation) {
      throw new NotFoundException('Чат не найден');
    }

    const participantIds = await this.getParticipantIds(conversationId);
    const targets = participantIds.filter((id) => id !== userId);
    if (targets.length === 0) {
      throw new BadRequestException('Некому звонить');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const isGroup = conversation.type === ConversationType.GROUP;
    const conversationTitle = conversation.title?.trim() || null;
    const callId = randomUUID();
    const payload: CallInvitePayload = {
      callId,
      conversationId,
      fromUserId: userId,
      fromNickname: user.nickname,
      fromAvatarUrl: await this.getAvatarUrl(userId, 'display'),
      conversationTitle,
      isGroup,
    };

    const call: ActiveVoiceCall = {
      ...payload,
      ringingUserIds: targets,
      joinedUserIds: [userId],
      createdAt: Date.now(),
    };
    call.ringTimer = setTimeout(() => {
      void this.stopVoiceCallRinging(callId);
    }, VOICE_CALL_RING_MS);
    call.waitTimer = setTimeout(() => {
      void this.expireSoloVoiceCall(callId);
    }, VOICE_CALL_WAIT_MS);

    this.activeVoiceCalls.set(callId, call);
    this.realtime.emitCallInvite(targets, payload);

    const ringing = await this.toVoiceCallPeers(targets);
    return { callId, conversationId, isGroup, ringing };
  }

  async getActiveVoiceCall(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    this.pruneExpiredVoiceCalls();
    const call = this.findActiveCallForConversation(conversationId);
    if (!call) {
      return null;
    }
    const isJoined = call.joinedUserIds.includes(userId);
    return {
      callId: call.callId,
      conversationId: call.conversationId,
      fromUserId: call.fromUserId,
      fromNickname: call.fromNickname,
      fromAvatarUrl: call.fromAvatarUrl,
      conversationTitle: call.conversationTitle,
      isGroup: call.isGroup,
      joinedCount: call.joinedUserIds.length,
      canJoin: !isJoined,
      isJoined,
    };
  }

  async acceptVoiceCall(userId: string, conversationId: string, callId: string) {
    await this.assertParticipant(userId, conversationId);
    const call = this.requireVoiceCall(callId, conversationId);

    if (call.joinedUserIds.includes(userId)) {
      return {
        callId: call.callId,
        conversationId: call.conversationId,
        byUserId: userId,
      };
    }

    // Ring timed out or busy UI parked the invite — chat members may still late-join.
    if (!call.ringingUserIds.includes(userId)) {
      return this.joinVoiceCall(userId, conversationId, callId);
    }

    call.ringingUserIds = call.ringingUserIds.filter((id) => id !== userId);
    call.joinedUserIds.push(userId);
    if (call.ringingUserIds.length === 0) {
      this.clearVoiceCallRingTimer(call);
    }
    if (call.joinedUserIds.length > 1) {
      this.clearVoiceCallWaitTimer(call);
    }

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: userId,
    };

    const notify = uniqueIds(
      [...call.joinedUserIds, ...call.ringingUserIds].filter((id) => id !== userId),
    );
    if (notify.length > 0) {
      this.realtime.emitCallAccepted(notify, signal);
    }

    return signal;
  }

  /** Late join into an already-active group/direct call. */
  async joinVoiceCall(userId: string, conversationId: string, callId?: string) {
    await this.assertParticipant(userId, conversationId);
    this.pruneExpiredVoiceCalls();

    const call = callId?.trim()
      ? this.requireVoiceCall(callId.trim(), conversationId)
      : this.findActiveCallForConversation(conversationId);
    if (!call) {
      throw new NotFoundException('Звонок уже завершён');
    }

    if (call.joinedUserIds.includes(userId)) {
      return {
        callId: call.callId,
        conversationId: call.conversationId,
        byUserId: userId,
      };
    }

    call.ringingUserIds = call.ringingUserIds.filter((id) => id !== userId);
    call.joinedUserIds.push(userId);
    if (call.ringingUserIds.length === 0) {
      this.clearVoiceCallRingTimer(call);
    }
    if (call.joinedUserIds.length > 1) {
      this.clearVoiceCallWaitTimer(call);
    }

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: userId,
    };
    const notify = uniqueIds(
      [...call.joinedUserIds, ...call.ringingUserIds].filter((id) => id !== userId),
    );
    if (notify.length > 0) {
      this.realtime.emitCallAccepted(notify, signal);
    }

    return signal;
  }

  async declineVoiceCall(userId: string, conversationId: string, callId: string) {
    await this.assertParticipant(userId, conversationId);
    const call = this.requireVoiceCall(callId, conversationId);
    if (!call.ringingUserIds.includes(userId)) {
      // Already joined or already left ringing — soft ok.
      return { ok: true as const };
    }

    call.ringingUserIds = call.ringingUserIds.filter((id) => id !== userId);

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: userId,
    };

    const notifyDeclined = uniqueIds(
      call.joinedUserIds.filter((id) => id !== userId),
    );
    if (notifyDeclined.length > 0) {
      this.realtime.emitCallDeclined(notifyDeclined, signal);
    }

    // Soft decline: others keep ringing / talking. Solo caller keeps waiting up to WAIT_MS.
    if (call.ringingUserIds.length === 0) {
      this.clearVoiceCallRingTimer(call);
    }

    return { ok: true as const };
  }

  /** Leave the call. Ends for everyone when the room is empty. */
  async endVoiceCall(userId: string, conversationId: string, callId: string) {
    await this.assertParticipant(userId, conversationId);
    const call = this.activeVoiceCalls.get(callId);
    if (!call || call.conversationId !== conversationId) {
      return { ok: true as const };
    }

    const inJoined = call.joinedUserIds.includes(userId);
    const inRinging = call.ringingUserIds.includes(userId);
    if (!inJoined && !inRinging) {
      return { ok: true as const };
    }

    // Solo cancel: caller (or last lobby occupant) leaves before anyone else joins.
    const aloneBeforeLeave =
      inJoined && call.joinedUserIds.length === 1 && call.joinedUserIds[0] === userId;

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: userId,
    };

    if (inRinging) {
      call.ringingUserIds = call.ringingUserIds.filter((id) => id !== userId);
    }
    if (inJoined) {
      call.joinedUserIds = call.joinedUserIds.filter((id) => id !== userId);
    }

    // Room empty — end for everyone (direct and group).
    if (call.joinedUserIds.length === 0) {
      const ringingLeft = [...call.ringingUserIds];
      this.clearVoiceCallTimers(call);
      this.activeVoiceCalls.delete(callId);
      // Notify whole chat so join banners clear, not only ringing callees.
      let notify = ringingLeft;
      try {
        const participants = await this.getParticipantIds(conversationId);
        notify = uniqueIds([...ringingLeft, ...participants]);
      } catch {
        // fall back to ringing only
      }
      if (notify.length > 0) {
        this.realtime.emitCallEnded(
          notify.filter((id) => id !== userId),
          signal,
        );
      }
      if (aloneBeforeLeave) {
        try {
          await this.postMissedVoiceCallMessage(call.fromUserId, call.conversationId);
        } catch {
          // best-effort
        }
      }
      return { ok: true as const };
    }

    if (call.ringingUserIds.length === 0) {
      this.clearVoiceCallRingTimer(call);
    }

    // Someone left — remaining people keep the lobby (incl. 1:1 solo wait).
    if (call.joinedUserIds.length === 1) {
      this.clearVoiceCallWaitTimer(call);
      call.waitTimer = setTimeout(() => {
        void this.expireAbandonedVoiceCall(callId);
      }, VOICE_CALL_ABANDON_MS);
    }

    return { ok: true as const };
  }

  /** Ring phase over: dismiss callee UI, keep lobby open for late join. */
  private async stopVoiceCallRinging(callId: string) {
    const call = this.activeVoiceCalls.get(callId);
    if (!call || call.ringingUserIds.length === 0) {
      return;
    }

    const stillRinging = [...call.ringingUserIds];
    call.ringingUserIds = [];
    this.clearVoiceCallRingTimer(call);

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: call.fromUserId,
    };
    this.realtime.emitCallEnded(stillRinging, signal);

    // Drop waiting tiles for people still in the room (usually the caller).
    for (const timedOutId of stillRinging) {
      this.realtime.emitCallDeclined(call.joinedUserIds, {
        callId: call.callId,
        conversationId: call.conversationId,
        byUserId: timedOutId,
      });
    }
  }

  /** Solo lobby timed out — nobody else joined. */
  private async expireSoloVoiceCall(callId: string) {
    const call = this.activeVoiceCalls.get(callId);
    if (!call) {
      return;
    }

    this.clearVoiceCallWaitTimer(call);

    // Someone joined — leave the call alone.
    if (call.joinedUserIds.length > 1) {
      return;
    }

    const stillRinging = [...call.ringingUserIds];
    call.ringingUserIds = [];
    this.clearVoiceCallRingTimer(call);
    this.activeVoiceCalls.delete(callId);

    const signal = {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: call.fromUserId,
    };
    const notify = uniqueIds([...call.joinedUserIds, ...stillRinging]);
    if (notify.length > 0) {
      this.realtime.emitCallEnded(notify, signal);
    }

    try {
      await this.postMissedVoiceCallMessage(call.fromUserId, call.conversationId);
    } catch {
      // best-effort
    }
  }

  /** Last person ghosted after others left — close the room, no missed-call message. */
  private async expireAbandonedVoiceCall(callId: string) {
    const call = this.activeVoiceCalls.get(callId);
    if (!call || call.joinedUserIds.length > 1) {
      return;
    }

    const notify = uniqueIds([...call.joinedUserIds, ...call.ringingUserIds]);
    this.clearVoiceCallTimers(call);
    this.activeVoiceCalls.delete(callId);

    if (notify.length === 0) {
      return;
    }
    this.realtime.emitCallEnded(notify, {
      callId: call.callId,
      conversationId: call.conversationId,
      byUserId: call.fromUserId,
    });
  }

  private clearVoiceCallRingTimer(call: ActiveVoiceCall) {
    if (call.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = undefined;
    }
  }

  private clearVoiceCallWaitTimer(call: ActiveVoiceCall) {
    if (call.waitTimer) {
      clearTimeout(call.waitTimer);
      call.waitTimer = undefined;
    }
  }

  private clearVoiceCallTimers(call: ActiveVoiceCall) {
    this.clearVoiceCallRingTimer(call);
    this.clearVoiceCallWaitTimer(call);
  }

  private async toVoiceCallPeers(userIds: string[]) {
    if (userIds.length === 0) {
      return [] as Array<{
        userId: string;
        nickname: string;
        avatarUrl: string | null;
      }>;
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      userIds.map(async (id) => {
        const user = byId.get(id);
        return {
          userId: id,
          nickname: user?.nickname ?? id,
          avatarUrl: await this.getAvatarUrl(id, 'display'),
        };
      }),
    );
  }

  private async postMissedVoiceCallMessage(callerId: string, conversationId: string) {
    const now = new Date();
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: callerId,
        body: 'Пропущенный звонок',
        kind: MessageKind.MISSED_VOICE_CALL,
      },
    });

    const participantIds = await this.getParticipantIds(conversationId);

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId: callerId },
        },
        create: { conversationId, userId: callerId, lastReadAt: now, hiddenAt: null },
        update: { lastReadAt: now, hiddenAt: null },
      }),
      ...participantIds
        .filter((id) => id !== callerId)
        .map((id) =>
          this.prisma.conversationRead.upsert({
            where: {
              conversationId_userId: { conversationId, userId: id },
            },
            create: {
              conversationId,
              userId: id,
              lastReadAt: new Date(0),
              hiddenAt: null,
            },
            update: { hiddenAt: null },
          }),
        ),
    ]);

    const dto = await this.toMessageDto(message);
    this.realtime.emitMessageNew(participantIds, dto);
    await Promise.all(
      participantIds.map(async (id) => {
        const summary = await this.getConversationSummary(id, conversationId);
        this.realtime.emitConversationUpdated([id], summary);
      }),
    );
    await this.emitUnreadForUsers(participantIds);
    return dto;
  }

  private findActiveCallForConversation(conversationId: string) {
    for (const call of this.activeVoiceCalls.values()) {
      if (call.conversationId === conversationId) {
        return call;
      }
    }
    return null;
  }

  private requireVoiceCall(callId: string, conversationId: string) {
    this.pruneExpiredVoiceCalls();
    if (!callId.trim()) {
      throw new BadRequestException('Не указан звонок');
    }
    const call = this.activeVoiceCalls.get(callId);
    if (!call || call.conversationId !== conversationId) {
      throw new NotFoundException('Звонок уже завершён');
    }
    return call;
  }

  private pruneExpiredVoiceCalls() {
    const now = Date.now();
    for (const [id, call] of this.activeVoiceCalls) {
      // Multi-party rooms stay until hangup.
      if (call.joinedUserIds.length > 1) {
        continue;
      }
      if (now - call.createdAt > VOICE_CALL_TTL_MS) {
        this.clearVoiceCallTimers(call);
        this.activeVoiceCalls.delete(id);
      }
    }
  }

  async deleteConversation(userId: string, conversationId: string, forEveryone = false) {
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || !membership) {
      this.realtime.emitConversationDeleted([userId], { conversationId });
      return { ok: true as const };
    }

    if (conversation.type === ConversationType.GROUP && forEveryone) {
      throw new BadRequestException('Групповой чат нельзя удалить для всех — выйдите из него');
    }

    if (!forEveryone) {
      const now = new Date();
      await this.prisma.conversationRead.upsert({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        create: { conversationId, userId, lastReadAt: now, hiddenAt: now },
        update: { hiddenAt: now, lastReadAt: now },
      });
      this.realtime.emitConversationDeleted([userId], { conversationId });
      this.realtime.emitUnreadSync(userId, {
        chats: await this.countUnreadChats(userId),
        notifications: await this.countUnreadNotifications(userId),
      });
      return { ok: true as const };
    }

    const participantIds = await this.getParticipantIds(conversationId);
    await this.deleteConversationMedia(conversationId);
    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });

    this.realtime.emitConversationDeleted(participantIds, { conversationId });
    await this.emitUnreadForUsers(participantIds);

    return { ok: true as const };
  }

  async countUnreadChats(userId: string): Promise<number> {
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
      if (!last || last.senderId === userId || isHiddenForUser(hiddenAt, last.createdAt)) {
        continue;
      }
      const lastReadAt = conversation.reads[0]?.lastReadAt;
      if (!lastReadAt || last.createdAt > lastReadAt) {
        unread += 1;
      }
    }
    return unread;
  }

  /**
   * Push fresh favorite flags to both participants after a reaction change.
   */
  async syncFavoriteFlagsBetween(userA: string, userB: string) {
    const pair = orderedPair(userA, userB);
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        userLowId_userHighId: pair,
      },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }

    const [summaryA, summaryB] = await Promise.all([
      this.getConversationSummary(userA, conversation.id),
      this.getConversationSummary(userB, conversation.id),
    ]);
    this.realtime.emitConversationUpdated([userA], summaryA);
    this.realtime.emitConversationUpdated([userB], summaryB);
  }

  private async countUnreadNotifications(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async setConversationBackground(
    userId: string,
    conversationId: string,
    input: {
      kind: 'default' | 'preset' | 'custom' | 'clear';
      presetId?: string | null;
      file?: Express.Multer.File | null;
    },
  ): Promise<ConversationListItem> {
    await this.assertParticipant(userId, conversationId);
    const participantIds = await this.getParticipantIds(conversationId);

    let backgroundKind: string | null = null;
    let backgroundPresetId: string | null = null;
    let backgroundUrl: string | null = null;

    if (input.kind === 'clear') {
      await this.mediaService.deleteCollection({
        entityType: 'Conversation',
        entityId: conversationId,
        collection: 'background',
      });
    } else if (input.kind === 'default') {
      backgroundKind = 'default';
      await this.mediaService.deleteCollection({
        entityType: 'Conversation',
        entityId: conversationId,
        collection: 'background',
      });
    } else if (input.kind === 'preset') {
      const presetId = input.presetId?.trim();
      if (!presetId) {
        throw new BadRequestException('Нужен presetId');
      }
      backgroundKind = 'preset';
      backgroundPresetId = presetId;
      await this.mediaService.deleteCollection({
        entityType: 'Conversation',
        entityId: conversationId,
        collection: 'background',
      });
    } else if (input.kind === 'custom') {
      const file = input.file;
      if (!file?.buffer?.length) {
        throw new BadRequestException('Нужен файл изображения');
      }
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException('Фон должен быть изображением');
      }
      const variants = await this.imageProcessor.processImage(
        file.buffer,
        file.mimetype,
        [...CHAT_BACKGROUND_IMAGE_VARIANTS],
      );
      await this.mediaService.replaceCollection(
        {
          entityType: 'Conversation',
          entityId: conversationId,
          collection: 'background',
        },
        variants,
      );
      const media = await this.mediaService.getCollection({
        entityType: 'Conversation',
        entityId: conversationId,
        collection: 'background',
      });
      const urls = await this.mediaService.getCollectionUrls(media);
      const url = urls.original ?? urls.large ?? urls.medium ?? null;
      if (!url) {
        throw new BadRequestException('Не удалось сохранить фон');
      }
      backgroundKind = 'custom';
      backgroundUrl = url;
    } else {
      throw new BadRequestException('Неизвестный kind');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        backgroundKind,
        backgroundPresetId,
        backgroundUrl,
      },
    });

    const summaries = await Promise.all(
      participantIds.map((id) => this.getConversationSummary(id, conversationId)),
    );
    for (let i = 0; i < participantIds.length; i += 1) {
      this.realtime.emitConversationUpdated([participantIds[i]], summaries[i]);
    }

    const mine = summaries.find((_, i) => participantIds[i] === userId);
    return mine ?? summaries[0];
  }

  private async getConversationSummary(
    userId: string,
    conversationId: string,
  ): Promise<ConversationListItem> {
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Нет доступа к чату');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        reads: true,
        participants: {
          include: {
            user: { select: { id: true, nickname: true, lastSeenAt: true } },
          },
        },
        userLow: { select: { id: true, nickname: true, lastSeenAt: true } },
        userHigh: { select: { id: true, nickname: true, lastSeenAt: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Чат не найден');
    }

    const myRead = conversation.reads.find((read) => read.userId === userId);
    const last = conversation.messages[0] ?? null;
    const lastReadAt = myRead?.lastReadAt;
    const unread = Boolean(
      last &&
        last.senderId !== userId &&
        (!lastReadAt || last.createdAt > lastReadAt),
    );

    let attachmentKind: ChatAttachmentKind | null = null;
    if (last) {
      attachmentKind = await this.getMessageAttachmentKind(last.id);
    }

    const lastMessage = last
      ? {
          id: last.id,
          body: this.previewBodyForViewer(last.body, last.kind, last.senderId, userId),
          senderId: last.senderId,
          createdAt: last.createdAt.toISOString(),
          hasImage: attachmentKind === 'image',
          attachmentKind,
          kind: toChatMessageKind(last.kind),
        }
      : null;

    if (conversation.type === ConversationType.GROUP) {
      const previewUsers = conversation.participants
        .filter((p) => p.userId !== userId)
        .slice(0, MEMBERS_PREVIEW_LIMIT)
        .map((p) => p.user);
      return {
        id: conversation.id,
        type: 'group',
        title: conversation.title,
        gameId: conversation.gameId,
        peer: null,
        memberCount: conversation.participants.length,
        membersPreview: await Promise.all(previewUsers.map((user) => this.toPeerDto(user))),
        peerLastReadAt: null,
        myRole: toChatMemberRole(membership.role),
        lastMessage,
        unread,
        isFavorite: false,
        peerFavoritedMe: false,
        blockedByMe: false,
        blockedMe: false,
        isPinned: Boolean(myRead?.pinnedAt),
        pinSortOrder: myRead?.pinSortOrder ?? null,
        background: toConversationBackground(conversation),
        updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
      };
    }

    const peerUser =
      conversation.userLowId === userId
        ? conversation.userHigh
        : conversation.userLow;
    if (!peerUser) {
      throw new NotFoundException('Собеседник не найден');
    }

    const peerRead = conversation.reads.find((read) => read.userId === peerUser.id);
    const favorite = await this.prisma.wandererReaction.findUnique({
      where: {
        viewerId_targetUserId: {
          viewerId: userId,
          targetUserId: peerUser.id,
        },
      },
      select: { type: true },
    });
    const peerFavorite = await this.prisma.wandererReaction.findUnique({
      where: {
        viewerId_targetUserId: {
          viewerId: peerUser.id,
          targetUserId: userId,
        },
      },
      select: { type: true },
    });
    const flags = await this.getBlockFlags(userId, peerUser.id);

    return {
      id: conversation.id,
      type: 'direct',
      title: null,
      gameId: null,
      peer: await this.toPeerDto(peerUser),
      memberCount: 2,
      membersPreview: [],
      peerLastReadAt: peerRead?.lastReadAt.toISOString() ?? null,
      lastMessage,
      unread,
      isFavorite:
        favorite?.type === 'FAVORITE' && !flags.blockedByMe && !flags.blockedMe,
      peerFavoritedMe:
        peerFavorite?.type === 'FAVORITE' && !flags.blockedByMe && !flags.blockedMe,
      blockedByMe: flags.blockedByMe,
      blockedMe: flags.blockedMe,
      isPinned: Boolean(myRead?.pinnedAt),
      pinSortOrder: myRead?.pinSortOrder ?? null,
      background: toConversationBackground(conversation),
      updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
    };
  }

  private async getBlockFlags(userId: string, peerId: string) {
    const [blockedByMe, blockedMe] = await Promise.all([
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: peerId } },
        select: { id: true },
      }),
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: peerId, blockedId: userId } },
        select: { id: true },
      }),
    ]);
    return {
      blockedByMe: Boolean(blockedByMe),
      blockedMe: Boolean(blockedMe),
    };
  }

  private async assertParticipant(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!membership) {
      const exists = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('Чат не найден');
      }
      throw new ForbiddenException('Нет доступа к чату');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Чат не найден');
    }

    return conversation;
  }

  private async assertDirectConversation(userId: string, conversationId: string) {
    const conversation = await this.assertParticipant(userId, conversationId);
    if (conversation.type !== ConversationType.DIRECT) {
      throw new BadRequestException('Действие доступно только в личном чате');
    }
    return conversation;
  }

  private directPeerId(conversation: Conversation, userId: string) {
    const peerId =
      conversation.userLowId === userId
        ? conversation.userHighId
        : conversation.userLowId;
    if (!peerId) {
      throw new NotFoundException('Собеседник не найден');
    }
    return peerId;
  }

  private async getParticipantIds(conversationId: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private async ensureDirectParticipants(
    conversationId: string,
    userId: string,
    peerUserId: string,
  ) {
    await Promise.all(
      [userId, peerUserId].map((id) =>
        this.prisma.conversationParticipant.upsert({
          where: {
            conversationId_userId: { conversationId, userId: id },
          },
          create: {
            conversationId,
            userId: id,
            role: ConversationParticipantRole.MEMBER,
          },
          update: {},
        }),
      ),
    );
  }

  private async syncGameChatMembers(
    conversationId: string,
    ownerId: string,
    memberIds: string[],
    title: string,
  ) {
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((row) => row.userId));
    const desired = new Set(memberIds);

    const toAdd = memberIds.filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !desired.has(id));

    if (toAdd.length > 0) {
      await this.prisma.conversationParticipant.createMany({
        data: toAdd.map((id) => ({
          conversationId,
          userId: id,
          role:
            id === ownerId
              ? ConversationParticipantRole.OWNER
              : ConversationParticipantRole.MEMBER,
        })),
        skipDuplicates: true,
      });
      await Promise.all(
        toAdd.map((id) =>
          this.prisma.conversationRead.upsert({
            where: {
              conversationId_userId: { conversationId, userId: id },
            },
            create: {
              conversationId,
              userId: id,
              lastReadAt: new Date(0),
            },
            update: {},
          }),
        ),
      );
    }

    if (toRemove.length > 0) {
      await this.prisma.conversationParticipant.deleteMany({
        where: { conversationId, userId: { in: toRemove } },
      });
      this.realtime.emitConversationDeleted(toRemove, { conversationId });
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  private async deleteConversationMedia(conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: { id: true },
    });
    const messageIds = messages.map((message) => message.id);
    if (messageIds.length === 0) {
      return;
    }

    const mediaRows = await this.prisma.media.findMany({
      where: {
        entityType: 'Message',
        entityId: { in: messageIds },
      },
      select: { entityId: true, collection: true },
    });

    const uniqueCollections = new Map<string, { entityId: string; collection: string }>();
    for (const row of mediaRows) {
      if (!isMessageAttachmentCollection(row.collection)) {
        continue;
      }
      uniqueCollections.set(`${row.entityId}:${row.collection}`, row);
    }

    await Promise.all(
      [...uniqueCollections.values()].map((row) =>
        this.mediaService.deleteCollection({
          entityType: 'Message',
          entityId: row.entityId,
          collection: row.collection,
        }),
      ),
    );
  }

  private async emitUnreadForUsers(userIds: string[]) {
    await Promise.all(
      uniqueIds(userIds).map(async (id) => {
        this.realtime.emitUnreadSync(id, {
          chats: await this.countUnreadChats(id),
          notifications: await this.countUnreadNotifications(id),
        });
      }),
    );
  }

  private async resolveMessageAttachments(
    messageId: string,
    attachmentName?: string | null,
  ): Promise<ChatAttachmentDto[]> {
    const rows = await this.prisma.media.findMany({
      where: {
        entityType: 'Message',
        entityId: messageId,
      },
    });

    const byCollection = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!isMessageAttachmentCollection(row.collection)) {
        continue;
      }
      const list = byCollection.get(row.collection) ?? [];
      list.push(row);
      byCollection.set(row.collection, list);
    }

    const collections = [...byCollection.keys()].sort(
      (a, b) => attachmentCollectionIndex(a) - attachmentCollectionIndex(b),
    );

    const attachments: ChatAttachmentDto[] = [];
    for (const [index, collection] of collections.entries()) {
      const media = byCollection.get(collection) ?? [];
      if (media.length === 0) {
        continue;
      }
      const primary = media[0];
      const kind = attachmentKindFromMime(primary.mimeType);
      const urls = await this.mediaService.getCollectionUrls(media);
      const image = kind === 'image' && Object.keys(urls).length > 0 ? urls : null;
      const fileUrl =
        kind === 'image'
          ? urls.original ?? urls.large ?? urls.medium ?? urls.thumb ?? null
          : await this.mediaService.getPublicUrl(primary);
      const fallbackName =
        kind === 'image' ? 'Фото' : kind === 'audio' ? 'Аудио' : 'Файл';
      const name =
        index === 0 && attachmentName?.trim()
          ? attachmentName.trim()
          : fallbackName;

      attachments.push({
        kind,
        name,
        mimeType: primary.mimeType,
        url: fileUrl,
        image,
        durationSec: primary.durationSec,
        waveform: this.parseStoredWaveform(primary.waveform),
      });
    }

    return attachments;
  }

  private parseVoiceWaveform(raw?: string): number[] | null {
    if (!raw) return null;
    try {
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values) || values.length < 8 || values.length > 128) return null;
      const waveform = values
        .map(Number)
        .filter(Number.isFinite)
        .map((value) => Math.max(0, Math.min(1, value)));
      return waveform.length === values.length ? waveform : null;
    } catch {
      return null;
    }
  }

  private parseStoredWaveform(value: Prisma.JsonValue | null): number[] | null {
    if (!Array.isArray(value)) return null;
    return value
      .map(Number)
      .filter(Number.isFinite)
      .map((item) => Math.max(0, Math.min(1, item)));
  }

  private async getMessageAttachmentKind(
    messageId: string,
  ): Promise<ChatAttachmentKind | null> {
    const attachments = await this.resolveMessageAttachments(messageId);
    return attachments[0]?.kind ?? null;
  }

  private previewBodyForViewer(
    body: string | null,
    kind: MessageKind | undefined,
    senderId: string,
    viewerId: string,
  ): string | null {
    if (kind !== MessageKind.DICE_ROLL) {
      return body;
    }
    const payload = parseDiceRollPayload(body);
    if (!payload) {
      return 'Бросок костей';
    }
    const forViewer =
      payload.hidden && senderId !== viewerId ? redactDiceRollPayload(payload) : payload;
    return diceRollPreviewText(forViewer, { isSender: senderId === viewerId });
  }

  private bodyForViewer(
    body: string | null,
    kind: MessageKind | undefined,
    senderId: string,
    viewerId?: string,
  ): string | null {
    if (kind !== MessageKind.DICE_ROLL || !viewerId) {
      return body;
    }
    const payload = parseDiceRollPayload(body);
    if (!payload) {
      return body;
    }
    if (payload.hidden && senderId !== viewerId) {
      return serializeDiceRollPayload(redactDiceRollPayload(payload));
    }
    return body;
  }

  private async toMessageDto(
    message: {
      id: string;
      conversationId: string;
      senderId: string;
      body: string | null;
      attachmentName?: string | null;
      kind?: MessageKind;
      createdAt: Date;
      replyToId?: string | null;
      replyToBody?: string | null;
      replyToSenderNickname?: string | null;
      replyToHasMedia?: boolean | null;
      forwardedFromUserId?: string | null;
      forwardedFromNickname?: string | null;
      forwardedFromMessageId?: string | null;
    },
    viewerId?: string,
  ): Promise<ChatMessageDto> {
    const senderUser = await this.prisma.user.findUnique({
      where: { id: message.senderId },
      select: { id: true, nickname: true },
    });
    const look =
      (await this.rewardsService.getLooksForUsers([message.senderId])).get(message.senderId) ?? {
        badges: [],
        avatarFrameId: null,
      };
    const sender: ChatMessageSender = {
      id: message.senderId,
      nickname: senderUser?.nickname ?? 'Игрок',
      avatarUrl: await this.getAvatarUrl(message.senderId),
      badges: look.badges,
      avatarFrameId: look.avatarFrameId,
    };

    const messageKind = toChatMessageKind(message.kind);
    const attachments = await this.resolveMessageAttachments(
      message.id,
      message.attachmentName,
    );
    const primary = attachments[0] ?? null;

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender,
      body: this.bodyForViewer(message.body, message.kind, message.senderId, viewerId),
      kind: messageKind,
      createdAt: message.createdAt.toISOString(),
      image: primary?.image ?? null,
      attachment: primary,
      attachments,
      replyTo: message.replyToId
        ? {
            id: message.replyToId,
            body: message.replyToBody ?? null,
            senderNickname: message.replyToSenderNickname?.trim() || 'Игрок',
            hasMedia: Boolean(message.replyToHasMedia),
          }
        : null,
      forwardedFrom:
        message.forwardedFromUserId && message.forwardedFromNickname
          ? {
              userId: message.forwardedFromUserId,
              nickname: message.forwardedFromNickname,
              messageId: message.forwardedFromMessageId ?? null,
            }
          : null,
    };
  }

  private async toPeerDto(peer: {
    id: string;
    nickname: string;
    lastSeenAt: Date | null;
  }): Promise<ChatPeer> {
    const look =
      (await this.rewardsService.getLooksForUsers([peer.id])).get(peer.id) ?? {
        badges: [],
        avatarFrameId: null,
      };
    return {
      id: peer.id,
      nickname: peer.nickname,
      avatarUrl: await this.getAvatarUrl(peer.id),
      online: this.realtime.isPresent(peer.id, peer.lastSeenAt),
      lastSeenAt: peer.lastSeenAt?.toISOString() ?? null,
      badges: look.badges,
      avatarFrameId: look.avatarFrameId,
    };
  }

  private async getAvatarUrl(
    userId: string,
    quality: 'list' | 'display' = 'list',
  ): Promise<string | null> {
    const media = await this.mediaService.getCollection({
      entityType: 'User',
      entityId: userId,
      collection: 'avatar',
    });
    const urls = await this.mediaService.getCollectionUrls(media);
    // Call tiles are ~96–128px (retina → 256): thumb(64) looks muddy.
    if (quality === 'display') {
      return urls.medium ?? urls.large ?? urls.small ?? urls.thumb ?? null;
    }
    return urls.thumb ?? urls.small ?? urls.medium ?? urls.large ?? null;
  }
}
