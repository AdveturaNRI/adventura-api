-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "cityId" TEXT,
    "schedule" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clubs_ownerId_idx" ON "clubs"("ownerId");

-- CreateIndex
CREATE INDEX "clubs_cityId_idx" ON "clubs"("cityId");

-- CreateIndex
CREATE INDEX "clubs_lat_lng_idx" ON "clubs"("lat", "lng");

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
