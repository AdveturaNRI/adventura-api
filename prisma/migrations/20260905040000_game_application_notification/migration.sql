-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GAME_APPLICATION';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "subject" TEXT NOT NULL DEFAULT '';
ALTER TABLE "notifications" ADD COLUMN "refId" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX IF EXISTS "notifications_userId_type_actorId_key";

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_type_actorId_refId_key" ON "notifications"("userId", "type", "actorId", "refId");
