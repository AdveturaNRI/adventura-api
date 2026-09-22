-- Backfill: ауры и скины кубиков, которые уже открыты наградами
INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'c' || substr(md5(r."userId" || ':aura:' || r."badgeType"), 1, 24),
    r."userId",
    'questionnaire_aura',
    CASE r."badgeType"
        WHEN 'founding_dm' THEN 'void_runes'
        WHEN 'alpha_tester' THEN 'aurora'
        WHEN 'bug_hunter' THEN 'neon_grid'
        ELSE NULL
    END,
    r."grantedAt"
FROM "user_rewards" r
WHERE CASE r."badgeType"
    WHEN 'founding_dm' THEN 'void_runes'
    WHEN 'alpha_tester' THEN 'aurora'
    WHEN 'bug_hunter' THEN 'neon_grid'
    ELSE NULL
END IS NOT NULL
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;

INSERT INTO "user_cosmetic_unlocks" ("id", "userId", "kind", "itemId", "grantedAt")
SELECT
    'c' || substr(md5(r."userId" || ':dice:' || r."badgeType"), 1, 24),
    r."userId",
    'dice_skin',
    CASE r."badgeType"
        WHEN 'founding_dm' THEN 'founding_obsidian'
        WHEN 'alpha_tester' THEN 'alpha_pioneer'
        WHEN 'bug_hunter' THEN 'neon_glitch'
        ELSE NULL
    END,
    r."grantedAt"
FROM "user_rewards" r
WHERE CASE r."badgeType"
    WHEN 'founding_dm' THEN 'founding_obsidian'
    WHEN 'alpha_tester' THEN 'alpha_pioneer'
    WHEN 'bug_hunter' THEN 'neon_glitch'
    ELSE NULL
END IS NOT NULL
ON CONFLICT ("userId", "kind", "itemId") DO NOTHING;
