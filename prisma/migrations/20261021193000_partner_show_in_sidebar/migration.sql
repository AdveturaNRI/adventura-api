-- AlterTable
ALTER TABLE "partners" ADD COLUMN "showInSidebar" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "partners_isActive_showInSidebar_sortOrder_idx" ON "partners"("isActive", "showInSidebar", "sortOrder");
