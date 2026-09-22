CREATE TYPE "MarketingLandingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "marketing_landings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "MarketingLandingStatus" NOT NULL DEFAULT 'DRAFT',
    "draftContent" JSONB NOT NULL DEFAULT '{}',
    "draftSeo" JSONB NOT NULL DEFAULT '{}',
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "marketing_landings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_landing_versions" (
    "id" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "seo" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "marketing_landing_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_landings_slug_key" ON "marketing_landings"("slug");
CREATE UNIQUE INDEX "marketing_landings_publishedVersionId_key" ON "marketing_landings"("publishedVersionId");
CREATE INDEX "marketing_landings_status_publishedAt_idx" ON "marketing_landings"("status", "publishedAt");
CREATE UNIQUE INDEX "marketing_landing_versions_landingId_version_key" ON "marketing_landing_versions"("landingId", "version");
CREATE INDEX "marketing_landing_versions_landingId_publishedAt_idx" ON "marketing_landing_versions"("landingId", "publishedAt");

ALTER TABLE "marketing_landing_versions" ADD CONSTRAINT "marketing_landing_versions_landingId_fkey"
  FOREIGN KEY ("landingId") REFERENCES "marketing_landings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_landings" ADD CONSTRAINT "marketing_landings_publishedVersionId_fkey"
  FOREIGN KEY ("publishedVersionId") REFERENCES "marketing_landing_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
