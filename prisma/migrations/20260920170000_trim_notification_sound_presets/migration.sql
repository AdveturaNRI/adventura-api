-- Drop unused seeded presets; move their users onto current default (magic).
UPDATE "User"
SET "notificationSoundPresetId" = 'nsound_magic'
WHERE "notificationSoundPresetId" IN ('nsound_dice', 'nsound_wood', 'nsound_fun');

DELETE FROM "Media"
WHERE "entityType" = 'NotificationSoundPreset'
  AND "entityId" IN ('nsound_dice', 'nsound_wood', 'nsound_fun');

DELETE FROM "notification_sound_presets"
WHERE "id" IN ('nsound_dice', 'nsound_wood', 'nsound_fun');
