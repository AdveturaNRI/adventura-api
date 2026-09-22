CREATE TYPE "MarketingCampaignPlatform" AS ENUM ('YANDEX_DIRECT', 'TELEGRAM', 'TIKTOK', 'OTHER');
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "MarketingExpenseSource" AS ENUM ('MANUAL', 'YANDEX_DIRECT_API');

CREATE TABLE "marketing_campaigns" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "platform" "MarketingCampaignPlatform" NOT NULL DEFAULT 'OTHER', "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT', "objective" TEXT, "plannedBudget" DECIMAL(14,2), "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB', "externalCampaignId" TEXT, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id"));
CREATE TABLE "marketing_campaign_variants" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "landingId" TEXT NOT NULL, "name" TEXT NOT NULL, "utmSource" TEXT NOT NULL, "utmMedium" TEXT NOT NULL, "utmCampaign" TEXT NOT NULL, "utmContent" TEXT, "utmTerm" TEXT, "utmId" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "marketing_campaign_variants_pkey" PRIMARY KEY ("id"));
CREATE TABLE "marketing_expenses" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "externalRecordId" TEXT, "amount" DECIMAL(14,2) NOT NULL, "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB', "source" "MarketingExpenseSource" NOT NULL DEFAULT 'MANUAL', "comment" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "marketing_expenses_pkey" PRIMARY KEY ("id"));
CREATE INDEX "marketing_campaigns_status_startsAt_idx" ON "marketing_campaigns"("status", "startsAt");
CREATE INDEX "marketing_campaign_variants_campaignId_isActive_idx" ON "marketing_campaign_variants"("campaignId", "isActive");
CREATE INDEX "marketing_campaign_variants_landingId_idx" ON "marketing_campaign_variants"("landingId");
CREATE UNIQUE INDEX "marketing_expenses_campaignId_externalRecordId_key" ON "marketing_expenses"("campaignId", "externalRecordId");
CREATE INDEX "marketing_expenses_campaignId_occurredAt_idx" ON "marketing_expenses"("campaignId", "occurredAt");
ALTER TABLE "marketing_campaign_variants" ADD CONSTRAINT "marketing_campaign_variants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "marketing_campaign_variants" ADD CONSTRAINT "marketing_campaign_variants_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE RESTRICT;
ALTER TABLE "marketing_expenses" ADD CONSTRAINT "marketing_expenses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE;
