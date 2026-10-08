CREATE TABLE "user_chat_reaction_preferences" (
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_chat_reaction_preferences_pkey" PRIMARY KEY ("userId", "emoji")
);

CREATE INDEX "user_chat_reaction_preferences_userId_useCount_idx" ON "user_chat_reaction_preferences"("userId", "useCount");

ALTER TABLE "user_chat_reaction_preferences" ADD CONSTRAINT "user_chat_reaction_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
