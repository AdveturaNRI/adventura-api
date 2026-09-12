CREATE TABLE "user_game_systems" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_game_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "userGameSystemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_game_systems_userId_normalizedName_key" ON "user_game_systems"("userId", "normalizedName");
CREATE INDEX "user_game_systems_userId_idx" ON "user_game_systems"("userId");
CREATE INDEX "games_userGameSystemId_idx" ON "games"("userGameSystemId");

ALTER TABLE "user_game_systems" ADD CONSTRAINT "user_game_systems_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "games" ADD CONSTRAINT "games_userGameSystemId_fkey" FOREIGN KEY ("userGameSystemId") REFERENCES "user_game_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
