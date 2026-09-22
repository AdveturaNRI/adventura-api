-- Выдать Хозяина таверны владельцам уже существующих клубов
INSERT INTO "user_rewards" ("id", "userId", "badgeType", "customDiceSkinId", "bonusCharacterSlots", "grantedAt")
SELECT
    'tk' || substr(md5(c."ownerId"), 1, 23),
    c."ownerId",
    'tavern_keeper'::"RewardBadgeType",
    'tavern_oak',
    1,
    NOW()
FROM (
    SELECT DISTINCT "ownerId"
    FROM "clubs"
    WHERE "deletedAt" IS NULL
) c
ON CONFLICT ("userId", "badgeType") DO NOTHING;

INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'tf' || substr(md5(r."userId" || ':oak_tankard'), 1, 23),
    r."userId",
    'avatar_frame',
    'oak_tankard',
    r."grantedAt"
FROM "user_rewards" r
WHERE r."badgeType" = 'tavern_keeper'
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;

INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'ta' || substr(md5(r."userId" || ':oak_shield'), 1, 23),
    r."userId",
    'questionnaire_aura',
    'oak_shield',
    r."grantedAt"
FROM "user_rewards" r
WHERE r."badgeType" = 'tavern_keeper'
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;

INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'td' || substr(md5(r."userId" || ':tavern_oak'), 1, 23),
    r."userId",
    'dice_skin',
    'tavern_oak',
    r."grantedAt"
FROM "user_rewards" r
WHERE r."badgeType" = 'tavern_keeper'
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;
