-- AlterTable
ALTER TABLE "games" ADD COLUMN "bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "games" SET "bumpedAt" = "updatedAt";

-- CreateIndex
CREATE INDEX "games_status_bumpedAt_idx" ON "games"("status", "bumpedAt");
