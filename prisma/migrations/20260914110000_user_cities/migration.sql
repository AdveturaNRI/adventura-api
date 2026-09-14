-- CreateTable
CREATE TABLE "user_cities" (
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cities_pkey" PRIMARY KEY ("userId","cityId")
);

-- CreateIndex
CREATE INDEX "user_cities_cityId_idx" ON "user_cities"("cityId");

-- CreateIndex
CREATE INDEX "user_cities_userId_sortOrder_idx" ON "user_cities"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "user_cities" ADD CONSTRAINT "user_cities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cities" ADD CONSTRAINT "user_cities_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy single cityId
INSERT INTO "user_cities" ("userId", "cityId", "sortOrder", "createdAt")
SELECT "id", "cityId", 0, CURRENT_TIMESTAMP
FROM "User"
WHERE "cityId" IS NOT NULL
ON CONFLICT DO NOTHING;
