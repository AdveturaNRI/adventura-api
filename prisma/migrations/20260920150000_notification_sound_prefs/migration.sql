-- AlterTable
ALTER TABLE "User" ADD COLUMN "notificationSoundsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notificationSoundPreset" TEXT NOT NULL DEFAULT 'magic';
