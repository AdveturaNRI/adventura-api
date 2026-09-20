-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';

-- CreateEnum
CREATE TYPE "BroadcastCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "broadcast_campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sendInApp" BOOLEAN NOT NULL DEFAULT true,
    "sendPush" BOOLEAN NOT NULL DEFAULT true,
    "status" "BroadcastCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "pushCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_campaigns_createdAt_idx" ON "broadcast_campaigns"("createdAt");
