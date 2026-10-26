export const REALTIME_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_REACTION: 'message:reaction',
  REACTION_UNREAD_SYNC: 'message-reaction:unread-sync',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_DELETED: 'conversation:deleted',
  NOTIFICATION_NEW: 'notification:new',
  ANNOUNCEMENT_PUBLISHED: 'announcement:published',
  UNREAD_SYNC: 'unread:sync',
  PRESENCE_UPDATE: 'presence:update',
  /** Client → server: the tab is visible and the user did something recently. Repeats every 30 s. */
  PRESENCE_ACTIVE: 'presence:active',
  /** Client → server: the tab went to background or the user stopped interacting. */
  PRESENCE_IDLE: 'presence:idle',
  TYPING_UPDATE: 'typing:update',
  CALL_INVITE: 'call:invite',
  CALL_ACCEPTED: 'call:accepted',
  CALL_DECLINED: 'call:declined',
  CALL_ENDED: 'call:ended',
} as const;

export type UnreadSyncPayload = {
  chats: number;
  notifications: number;
};

export type AnnouncementPublishedPayload = {
  id: string;
  publicationVersion: number;
};

export type PresenceUpdatePayload = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type TypingUpdatePayload = {
  conversationId: string;
  userId: string;
  nickname: string;
  typing: boolean;
};

export type ConversationReadPayload = {
  conversationId: string;
  readerId: string;
  lastReadAt: string;
};

export type ConversationDeletedPayload = {
  conversationId: string;
};

export type CallInvitePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromNickname: string;
  fromAvatarUrl: string | null;
  conversationTitle: string | null;
  isGroup: boolean;
};

export type CallSignalPayload = {
  callId: string;
  conversationId: string;
  byUserId: string;
};
