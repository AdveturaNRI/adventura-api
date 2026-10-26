-- CreateEnum
CREATE TYPE "PartnerPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'PARTNER';

-- AlterTable
ALTER TABLE "admin_accounts" ADD COLUMN     "partnerId" TEXT;

-- CreateTable
CREATE TABLE "partner_posts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "status" "PartnerPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_posts_status_publishedAt_idx" ON "partner_posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "partner_posts_partnerId_status_idx" ON "partner_posts"("partnerId", "status");

-- CreateIndex
CREATE INDEX "admin_accounts_partnerId_idx" ON "admin_accounts"("partnerId");

-- AddForeignKey
ALTER TABLE "partner_posts" ADD CONSTRAINT "partner_posts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
