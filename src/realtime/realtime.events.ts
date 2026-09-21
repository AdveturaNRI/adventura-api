export const REALTIME_EVENTS = {
  MESSAGE_NEW: 'message:new',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_DELETED: 'conversation:deleted',
  NOTIFICATION_NEW: 'notification:new',
  UNREAD_SYNC: 'unread:sync',
  PRESENCE_UPDATE: 'presence:update',
  CALL_INVITE: 'call:invite',
  CALL_ACCEPTED: 'call:accepted',
  CALL_DECLINED: 'call:declined',
  CALL_ENDED: 'call:ended',
} as const;

export type UnreadSyncPayload = {
  chats: number;
  notifications: number;
};

export type PresenceUpdatePayload = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
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
