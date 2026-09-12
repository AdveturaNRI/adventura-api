-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "type" "ConversationType" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "conversations" ADD COLUMN "title" TEXT;
ALTER TABLE "conversations" ADD COLUMN "gameId" TEXT;

-- Make pair columns nullable for group chats
ALTER TABLE "conversations" ALTER COLUMN "userLowId" DROP NOT NULL;
ALTER TABLE "conversations" ALTER COLUMN "userHighId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_gameId_key" ON "conversations"("gameId");

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill DIRECT participants from existing pair columns
INSERT INTO "conversation_participants" ("conversationId", "userId", "role", "joinedAt")
SELECT c."id", c."userLowId", 'MEMBER', c."createdAt"
FROM "conversations" c
WHERE c."userLowId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "conversation_participants" ("conversationId", "userId", "role", "joinedAt")
SELECT c."id", c."userHighId", 'MEMBER', c."createdAt"
FROM "conversations" c
WHERE c."userHighId" IS NOT NULL
ON CONFLICT DO NOTHING;
