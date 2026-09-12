INSERT INTO "experience_types" ("id", "name", "sortOrder")
VALUES ('clexp007', 'Новичок', 2)
ON CONFLICT ("name") DO NOTHING;

UPDATE "experience_types" SET "sortOrder" = 1 WHERE "name" = 'Нет опыта';
UPDATE "experience_types" SET "sortOrder" = 2 WHERE "name" = 'Новичок';
UPDATE "experience_types" SET "sortOrder" = 3 WHERE "name" = 'До 6 месяцев';
UPDATE "experience_types" SET "sortOrder" = 4 WHERE "name" = '6–12 месяцев';
UPDATE "experience_types" SET "sortOrder" = 5 WHERE "name" = '1–3 года';
UPDATE "experience_types" SET "sortOrder" = 6 WHERE "name" = '3–5 лет';
UPDATE "experience_types" SET "sortOrder" = 7 WHERE "name" = '5+ лет';
