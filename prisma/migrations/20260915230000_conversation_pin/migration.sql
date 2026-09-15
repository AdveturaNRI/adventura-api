-- AlterTable
ALTER TABLE "conversation_reads" ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "pinSortOrder" INTEGER;

-- CreateIndex
CREATE INDEX "conversation_reads_userId_pinnedAt_pinSortOrder_idx" ON "conversation_reads"("userId", "pinnedAt", "pinSortOrder");
