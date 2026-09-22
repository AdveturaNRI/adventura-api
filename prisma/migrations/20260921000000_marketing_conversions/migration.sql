CREATE TYPE "MarketingConversionType" AS ENUM (
  'LANDING_VIEW',
  'CTA_CLICK',
  'REGISTRATION_STARTED',
  'REGISTRATION_COMPLETED',
  'PROFILE_CREATED',
  'GAME_PUBLISHED',
  'APPLICATION_SENT',
  'APPLICATION_APPROVED',
  'MATCH_COMPLETED'
);

CREATE TABLE IF NOT EXISTS "marketing_conversions" (
  "id" TEXT NOT NULL,
  "type" "MarketingConversionType" NOT NULL,
  "anonymousId" UUID,
  "userId" TEXT,
  "campaignId" TEXT,
  "variantId" TEXT,
  "landingId" TEXT,
  "touchId" TEXT,
  "attributionModel" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "props" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "marketing_conversions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_conversions_idempotencyKey_key"
  ON "marketing_conversions"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "marketing_conversions_campaignId_type_occurredAt_idx"
  ON "marketing_conversions"("campaignId", "type", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_conversions_userId_type_occurredAt_idx"
  ON "marketing_conversions"("userId", "type", "occurredAt");
CREATE INDEX IF NOT EXISTS "marketing_conversions_anonymousId_type_occurredAt_idx"
  ON "marketing_conversions"("anonymousId", "type", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_conversions_userId_fkey'
  ) THEN
    ALTER TABLE "marketing_conversions"
      ADD CONSTRAINT "marketing_conversions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_conversions_campaignId_fkey'
  ) THEN
    ALTER TABLE "marketing_conversions"
      ADD CONSTRAINT "marketing_conversions_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_conversions_variantId_fkey'
  ) THEN
    ALTER TABLE "marketing_conversions"
      ADD CONSTRAINT "marketing_conversions_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "marketing_campaign_variants"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_conversions_landingId_fkey'
  ) THEN
    ALTER TABLE "marketing_conversions"
      ADD CONSTRAINT "marketing_conversions_landingId_fkey"
      FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_conversions_touchId_fkey'
  ) THEN
    ALTER TABLE "marketing_conversions"
      ADD CONSTRAINT "marketing_conversions_touchId_fkey"
      FOREIGN KEY ("touchId") REFERENCES "marketing_attribution_touches"("id") ON DELETE SET NULL;
  END IF;
END $$;

