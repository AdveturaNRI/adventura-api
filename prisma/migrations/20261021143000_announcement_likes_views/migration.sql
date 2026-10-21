-- AlterTable
ALTER TABLE "site_announcements" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "site_announcements" ADD COLUMN "likesCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "site_announcement_likes" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_announcement_likes_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "site_announcement_likes_userId_idx" ON "site_announcement_likes"("userId");

-- AddForeignKey
ALTER TABLE "site_announcement_likes" ADD CONSTRAINT "site_announcement_likes_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "site_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_announcement_likes" ADD CONSTRAINT "site_announcement_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
