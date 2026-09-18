-- AlterTable
ALTER TABLE "User" ADD COLUMN "prefersFreeOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "games" ADD COLUMN "clubId" TEXT;

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN "tablesCount" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "games_clubId_idx" ON "games"("clubId");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AnalyticsPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS', 'SERVER');

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "platform" "AnalyticsPlatform" NOT NULL DEFAULT 'SERVER',
    "appVersion" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "props" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily_metrics" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_name_occurredAt_idx" ON "analytics_events"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_occurredAt_idx" ON "analytics_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_occurredAt_idx" ON "analytics_events"("occurredAt");

-- CreateIndex
CREATE INDEX "analytics_daily_metrics_day_idx" ON "analytics_daily_metrics"("day");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_metrics_day_metric_key" ON "analytics_daily_metrics"("day", "metric");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
