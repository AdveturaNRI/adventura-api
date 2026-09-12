-- AlterTable
ALTER TABLE "User" ADD COLUMN     "about" TEXT,
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "availability" TEXT,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "playsOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readyToLearnNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" TEXT,
ADD COLUMN     "systems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_entityType_entityId_collection_idx" ON "Media"("entityType", "entityId", "collection");

-- CreateIndex
CREATE UNIQUE INDEX "Media_entityType_entityId_collection_variant_key" ON "Media"("entityType", "entityId", "collection", "variant");
