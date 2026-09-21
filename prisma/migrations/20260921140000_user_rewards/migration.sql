-- CreateEnum
CREATE TYPE "RewardBadgeType" AS ENUM ('alpha_tester', 'bug_hunter', 'founding_dm');

-- CreateTable
CREATE TABLE "user_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeType" "RewardBadgeType" NOT NULL,
    "customDiceSkinId" TEXT,
    "bonusCharacterSlots" INTEGER NOT NULL DEFAULT 0,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_rewards_userId_badgeType_key" ON "user_rewards"("userId", "badgeType");

-- CreateIndex
CREATE INDEX "user_rewards_userId_idx" ON "user_rewards"("userId");

-- AddForeignKey
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "daily_usage_counters" (
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usage_counters_pkey" PRIMARY KEY ("userId","kind","day")
);
