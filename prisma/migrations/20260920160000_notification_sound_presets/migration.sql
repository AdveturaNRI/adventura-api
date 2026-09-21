-- CreateTable
CREATE TABLE "notification_sound_presets" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "staticPath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_sound_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_sound_presets_slug_key" ON "notification_sound_presets"("slug");
CREATE INDEX "notification_sound_presets_sortOrder_idx" ON "notification_sound_presets"("sortOrder");

-- Seed defaults (stable ids for migration mapping)
INSERT INTO "notification_sound_presets" ("id", "slug", "label", "description", "staticPath", "sortOrder", "isDefault", "isActive", "createdAt", "updatedAt")
VALUES
  ('nsound_magic', 'magic', 'Магия / Волшебство', 'Фэнтезийный тон по умолчанию', '/sounds/notify-magic.mp3', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('nsound_bell', 'bell', 'Классический колокольчик', 'Короткий нейтральный «динь»', '/sounds/notify-bell.mp3', 1, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "notificationSoundPresetId" TEXT;
ALTER TABLE "User" ADD COLUMN "useCustomNotificationSound" BOOLEAN NOT NULL DEFAULT false;

-- Map legacy slug string → FK
UPDATE "User" u
SET "notificationSoundPresetId" = p."id"
FROM "notification_sound_presets" p
WHERE p."slug" = u."notificationSoundPreset";

UPDATE "User"
SET "notificationSoundPresetId" = 'nsound_magic'
WHERE "notificationSoundPresetId" IS NULL;

ALTER TABLE "User" DROP COLUMN "notificationSoundPreset";

CREATE INDEX "User_notificationSoundPresetId_idx" ON "User"("notificationSoundPresetId");

ALTER TABLE "User"
ADD CONSTRAINT "User_notificationSoundPresetId_fkey"
FOREIGN KEY ("notificationSoundPresetId")
REFERENCES "notification_sound_presets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
