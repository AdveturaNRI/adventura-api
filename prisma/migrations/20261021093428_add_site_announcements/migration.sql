-- CreateEnum
CREATE TYPE "SiteAnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "marketing_attribution_touches" DROP CONSTRAINT "marketing_attribution_touches_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_attribution_touches" DROP CONSTRAINT "marketing_attribution_touches_landingId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_attribution_touches" DROP CONSTRAINT "marketing_attribution_touches_userId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_attribution_touches" DROP CONSTRAINT "marketing_attribution_touches_variantId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_campaign_variants" DROP CONSTRAINT "marketing_campaign_variants_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_campaign_variants" DROP CONSTRAINT "marketing_campaign_variants_landingId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_conversions" DROP CONSTRAINT "marketing_conversions_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_conversions" DROP CONSTRAINT "marketing_conversions_landingId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_conversions" DROP CONSTRAINT "marketing_conversions_touchId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_conversions" DROP CONSTRAINT "marketing_conversions_userId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_conversions" DROP CONSTRAINT "marketing_conversions_variantId_fkey";

-- DropForeignKey
ALTER TABLE "marketing_expenses" DROP CONSTRAINT "marketing_expenses_campaignId_fkey";

-- AlterTable
ALTER TABLE "games" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "site_announcements" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "status" "SiteAnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publicationVersion" INTEGER NOT NULL DEFAULT 0,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_announcement_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "publicationVersion" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_announcements_status_publishedAt_idx" ON "site_announcements"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "site_announcements_status_publicationVersion_idx" ON "site_announcements"("status", "publicationVersion");

-- CreateIndex
CREATE INDEX "site_announcement_dismissals_userId_dismissedAt_idx" ON "site_announcement_dismissals"("userId", "dismissedAt");

-- CreateIndex
CREATE INDEX "site_announcement_dismissals_announcementId_idx" ON "site_announcement_dismissals"("announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "site_announcement_dismissals_userId_announcementId_publicat_key" ON "site_announcement_dismissals"("userId", "announcementId", "publicationVersion");

-- AddForeignKey
ALTER TABLE "marketing_campaign_variants" ADD CONSTRAINT "marketing_campaign_variants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaign_variants" ADD CONSTRAINT "marketing_campaign_variants_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_expenses" ADD CONSTRAINT "marketing_expenses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_attribution_touches" ADD CONSTRAINT "marketing_attribution_touches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_attribution_touches" ADD CONSTRAINT "marketing_attribution_touches_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_attribution_touches" ADD CONSTRAINT "marketing_attribution_touches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "marketing_campaign_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_attribution_touches" ADD CONSTRAINT "marketing_attribution_touches_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "marketing_campaign_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_conversions" ADD CONSTRAINT "marketing_conversions_touchId_fkey" FOREIGN KEY ("touchId") REFERENCES "marketing_attribution_touches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_announcement_dismissals" ADD CONSTRAINT "site_announcement_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_announcement_dismissals" ADD CONSTRAINT "site_announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "site_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
