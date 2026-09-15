-- Reply / forward metadata on messages
ALTER TABLE "messages"
  ADD COLUMN "replyToId" TEXT,
  ADD COLUMN "replyToBody" TEXT,
  ADD COLUMN "replyToSenderNickname" TEXT,
  ADD COLUMN "replyToHasMedia" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "forwardedFromUserId" TEXT,
  ADD COLUMN "forwardedFromNickname" TEXT,
  ADD COLUMN "forwardedFromMessageId" TEXT;

CREATE INDEX "messages_replyToId_idx" ON "messages"("replyToId");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
