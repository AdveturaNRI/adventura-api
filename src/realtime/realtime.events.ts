export const REALTIME_EVENTS = {
  MESSAGE_NEW: 'message:new',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_DELETED: 'conversation:deleted',
  NOTIFICATION_NEW: 'notification:new',
  UNREAD_SYNC: 'unread:sync',
  PRESENCE_UPDATE: 'presence:update',
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
