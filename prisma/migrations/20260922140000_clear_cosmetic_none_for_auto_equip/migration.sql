-- Accidental "Выкл" from appearance saves blocked auto-equip for owned frames/auras.
-- Empty equipped = auto from badges/unlocks; only explicit "none" after this means off.
UPDATE "User"
SET "equippedAvatarFrameId" = NULL
WHERE "equippedAvatarFrameId" = 'none';

UPDATE "User"
SET "equippedQuestionnaireAuraId" = NULL
WHERE "equippedQuestionnaireAuraId" = 'none';
