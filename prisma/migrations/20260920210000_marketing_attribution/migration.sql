CREATE TABLE IF NOT EXISTS "marketing_attribution_touches" (
  "id" TEXT NOT NULL,
  "anonymousId" UUID NOT NULL,
  "userId" TEXT,
  "campaignId" TEXT,
  "variantId" TEXT,
  "landingId" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "utmId" TEXT,
  "yclid" TEXT,
  "referrer" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_attribution_touches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketing_attribution_touches_anonymousId_occurredAt_idx"
  ON "marketing_attribution_touches"("anonymousId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_attribution_touches_userId_occurredAt_idx"
  ON "marketing_attribution_touches"("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_attribution_touches_campaignId_occurredAt_idx"
  ON "marketing_attribution_touches"("campaignId", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_attribution_touches_variantId_occurredAt_idx"
  ON "marketing_attribution_touches"("variantId", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_attribution_touches_userId_fkey'
  ) THEN
    ALTER TABLE "marketing_attribution_touches"
      ADD CONSTRAINT "marketing_attribution_touches_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_attribution_touches_campaignId_fkey'
  ) THEN
    ALTER TABLE "marketing_attribution_touches"
      ADD CONSTRAINT "marketing_attribution_touches_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_attribution_touches_variantId_fkey'
  ) THEN
    ALTER TABLE "marketing_attribution_touches"
      ADD CONSTRAINT "marketing_attribution_touches_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "marketing_campaign_variants"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_attribution_touches_landingId_fkey'
  ) THEN
    ALTER TABLE "marketing_attribution_touches"
      ADD CONSTRAINT "marketing_attribution_touches_landingId_fkey"
      FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE SET NULL;
  END IF;
END $$;
