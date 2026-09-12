CREATE TABLE "game_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_systems_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_systems_name_key" ON "game_systems"("name");

INSERT INTO "game_systems" ("id", "name", "sortOrder") VALUES
('clgs001', 'D&D 5e', 1),
('clgs002', 'D&D 4e', 2),
('clgs003', 'Pathfinder 2e', 3),
('clgs004', 'Call of Cthulhu', 4),
('clgs005', 'Вархаммер', 5)
ON CONFLICT ("name") DO NOTHING;
