import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const rows = await p.$queryRaw`
  SELECT
    COUNT(*) FILTER (WHERE "equippedAvatarFrameId" = 'none')::int AS frame_none,
    COUNT(*) FILTER (WHERE "equippedAvatarFrameId" IS NULL)::int AS frame_null,
    COUNT(*) FILTER (WHERE "equippedAvatarFrameId" IS NOT NULL AND "equippedAvatarFrameId" <> 'none')::int AS frame_set,
    COUNT(*) FILTER (WHERE "equippedQuestionnaireAuraId" = 'none')::int AS aura_none,
    COUNT(*) FILTER (WHERE "equippedQuestionnaireAuraId" IS NULL)::int AS aura_null,
    COUNT(*) FILTER (WHERE "equippedQuestionnaireAuraId" IS NOT NULL AND "equippedQuestionnaireAuraId" <> 'none')::int AS aura_set
  FROM "User"`;
console.log('counts', rows);

const sample = await p.$queryRaw`
  SELECT u.nickname, u."equippedAvatarFrameId" AS frame, u."equippedQuestionnaireAuraId" AS aura,
    (SELECT array_agg(r."badgeType") FROM "UserReward" r WHERE r."userId"=u.id) AS badges
  FROM "User" u
  WHERE EXISTS (SELECT 1 FROM "UserReward" r WHERE r."userId"=u.id)
  ORDER BY u."createdAt" DESC
  LIMIT 20`;
console.log(sample);

await p.$disconnect();
