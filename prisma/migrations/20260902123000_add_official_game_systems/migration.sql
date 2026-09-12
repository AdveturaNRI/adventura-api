ALTER TABLE "game_systems" ADD COLUMN "isOfficial" BOOLEAN NOT NULL DEFAULT false;

DELETE FROM "game_systems"
WHERE "id" IN ('clgs001', 'clgs002', 'clgs003', 'clgs004', 'clgs005');

INSERT INTO "game_systems" ("id", "name", "sortOrder", "isOfficial") VALUES
('clgs101', 'Dungeons & Dragons', 1, true),
('clgs102', 'Pathfinder', 2, true),
('clgs103', 'Vampire: The Masquerade', 3, true),
('clgs104', 'Warhammer 40,000', 4, true),
('clgs105', 'Call of Cthulhu', 5, true),
('clgs106', 'Cyberpunk', 6, true)
ON CONFLICT ("name") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "isOfficial" = EXCLUDED."isOfficial";
