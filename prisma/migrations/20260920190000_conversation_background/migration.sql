-- Shared wallpaper for all participants of a conversation.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "backgroundKind" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "backgroundPresetId" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "backgroundUrl" TEXT;
