-- AlterTable
ALTER TABLE "music_playlists" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "music_playlists_userId_parentId_idx" ON "music_playlists"("userId", "parentId");

-- CreateIndex
CREATE INDEX "music_playlists_parentId_idx" ON "music_playlists"("parentId");

-- AddForeignKey
ALTER TABLE "music_playlists" ADD CONSTRAINT "music_playlists_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "music_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
