-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('RECRUITING', 'CLOSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "GameApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "games" ADD COLUMN "status" "GameStatus" NOT NULL DEFAULT 'RECRUITING';

-- CreateTable
CREATE TABLE "game_applications" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GameApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "game_applications_gameId_status_idx" ON "game_applications"("gameId", "status");

-- CreateIndex
CREATE INDEX "game_applications_userId_idx" ON "game_applications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_applications_gameId_userId_key" ON "game_applications"("gameId", "userId");

-- CreateIndex
CREATE INDEX "game_players_gameId_idx" ON "game_players"("gameId");

-- CreateIndex
CREATE INDEX "game_players_userId_idx" ON "game_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_gameId_userId_key" ON "game_players"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "game_applications" ADD CONSTRAINT "game_applications_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_applications" ADD CONSTRAINT "game_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
