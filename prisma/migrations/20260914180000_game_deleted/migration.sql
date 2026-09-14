-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'GAME_DELETED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GAME_DELETED';

-- Keep group chat when game is deleted (detach instead of cascade)
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_gameId_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;
