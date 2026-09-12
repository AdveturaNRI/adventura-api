-- CreateEnum
CREATE TYPE "WandererReactionType" AS ENUM ('FAVORITE', 'SKIPPED');

-- CreateTable
CREATE TABLE "wanderer_reactions" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "type" "WandererReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wanderer_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wanderer_reactions_viewerId_type_idx" ON "wanderer_reactions"("viewerId", "type");

-- CreateIndex
CREATE INDEX "wanderer_reactions_targetUserId_idx" ON "wanderer_reactions"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "wanderer_reactions_viewerId_targetUserId_key" ON "wanderer_reactions"("viewerId", "targetUserId");

-- AddForeignKey
ALTER TABLE "wanderer_reactions" ADD CONSTRAINT "wanderer_reactions_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wanderer_reactions" ADD CONSTRAINT "wanderer_reactions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
