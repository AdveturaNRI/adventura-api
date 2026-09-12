-- Заявки ACCEPTED без записи в составе больше не считаем принятыми.
UPDATE "game_applications" AS ga
SET "status" = 'REJECTED'
WHERE ga."status" = 'ACCEPTED'
  AND NOT EXISTS (
    SELECT 1
    FROM "game_players" gp
    WHERE gp."gameId" = ga."gameId"
      AND gp."userId" = ga."userId"
  );
