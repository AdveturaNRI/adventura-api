-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('ONESHOT', 'CAMPAIGN');

-- AlterTable
ALTER TABLE "games" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "games" ADD COLUMN "title" TEXT;
ALTER TABLE "games" ADD COLUMN "description" TEXT;
ALTER TABLE "games" ADD COLUMN "maxPlayers" INTEGER;
ALTER TABLE "games" ADD COLUMN "kind" "GameKind" NOT NULL DEFAULT 'ONESHOT';
ALTER TABLE "games" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "games" ADD COLUMN "cityId" TEXT;
ALTER TABLE "games" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "games" ADD COLUMN "priceRub" INTEGER;
ALTER TABLE "games" ADD COLUMN "experienceTypeId" TEXT;
ALTER TABLE "games" ADD COLUMN "beginnersWelcome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "games" ADD COLUMN "minAge" INTEGER;
ALTER TABLE "games" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop stub rows that cannot be backfilled
DELETE FROM "games";

ALTER TABLE "games" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "games" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "games" ALTER COLUMN "maxPlayers" SET NOT NULL;

-- CreateIndex
CREATE INDEX "games_ownerId_idx" ON "games"("ownerId");
CREATE INDEX "games_cityId_idx" ON "games"("cityId");
CREATE INDEX "games_scheduledAt_idx" ON "games"("scheduledAt");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "games" ADD CONSTRAINT "games_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "games" ADD CONSTRAINT "games_experienceTypeId_fkey" FOREIGN KEY ("experienceTypeId") REFERENCES "experience_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
