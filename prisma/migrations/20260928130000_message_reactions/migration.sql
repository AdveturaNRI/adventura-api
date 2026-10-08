CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_reaction_receipts" (
    "id" TEXT NOT NULL,
    "reactionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "message_reaction_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_reactions_messageId_userId_key" ON "message_reactions"("messageId", "userId");
CREATE INDEX "message_reactions_messageId_createdAt_idx" ON "message_reactions"("messageId", "createdAt");
CREATE UNIQUE INDEX "message_reaction_receipts_reactionId_recipientId_key" ON "message_reaction_receipts"("reactionId", "recipientId");
CREATE INDEX "message_reaction_receipts_recipientId_readAt_createdAt_idx" ON "message_reaction_receipts"("recipientId", "readAt", "createdAt");

ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_reaction_receipts" ADD CONSTRAINT "message_reaction_receipts_reactionId_fkey" FOREIGN KEY ("reactionId") REFERENCES "message_reactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_reaction_receipts" ADD CONSTRAINT "message_reaction_receipts_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
