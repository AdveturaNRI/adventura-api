-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_playlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_playlist_items" (
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_playlist_items_pkey" PRIMARY KEY ("playlistId","trackId")
);

-- CreateIndex
CREATE INDEX "music_tracks_userId_createdAt_idx" ON "music_tracks"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "music_playlists_userId_sortOrder_idx" ON "music_playlists"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "music_playlist_items_trackId_idx" ON "music_playlist_items"("trackId");

-- CreateIndex
CREATE INDEX "music_playlist_items_playlistId_sortOrder_idx" ON "music_playlist_items"("playlistId", "sortOrder");

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_playlists" ADD CONSTRAINT "music_playlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_playlist_items" ADD CONSTRAINT "music_playlist_items_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "music_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_playlist_items" ADD CONSTRAINT "music_playlist_items_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "music_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
