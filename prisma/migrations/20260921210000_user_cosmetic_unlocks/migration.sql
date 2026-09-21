-- CreateTable
CREATE TABLE "user_cosmetic_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetic_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_cosmetic_unlocks_userId_kind_itemId_key" ON "user_cosmetic_unlocks"("userId", "kind", "itemId");

-- CreateIndex
CREATE INDEX "user_cosmetic_unlocks_userId_idx" ON "user_cosmetic_unlocks"("userId");

-- AddForeignKey
ALTER TABLE "user_cosmetic_unlocks" ADD CONSTRAINT "user_cosmetic_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: рамки, которые уже открыты наградами
INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'c' || substr(md5(r."userId" || ':' || r."badgeType"), 1, 24),
    r."userId",
    'avatar_frame',
    CASE r."badgeType"
        WHEN 'founding_dm' THEN 'founding_embers'
        WHEN 'alpha_tester' THEN 'alpha_runes'
        WHEN 'bug_hunter' THEN 'neon_scan'
        WHEN 'early_arrival' THEN 'steel_band'
        ELSE NULL
    END,
    r."grantedAt"
FROM "user_rewards" r
WHERE CASE r."badgeType"
    WHEN 'founding_dm' THEN 'founding_embers'
    WHEN 'alpha_tester' THEN 'alpha_runes'
    WHEN 'bug_hunter' THEN 'neon_scan'
    WHEN 'early_arrival' THEN 'steel_band'
    ELSE NULL
END IS NOT NULL
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;
