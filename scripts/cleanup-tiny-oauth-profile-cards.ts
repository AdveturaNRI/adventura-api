import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { MediaService } from '../src/media/media.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Same gate as uploadProfileCard — OAuth imports bypassed it. */
const MIN_SHORT_SIDE = 600;
const USER_ENTITY_TYPE = 'User';
const PROFILE_CARD_COLLECTION = 'profileCard';

type TinyCardRow = {
  entityId: string;
  shortSide: number;
  width: number | null;
  height: number | null;
  variant: string;
  size: number;
};

async function main() {
  const apply = process.argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const media = app.get(MediaService);

    // Prefer the largest stored side (card / original). Short side < 600
    // matches photos that would be rejected on a normal profileCard upload.
    const rows = await prisma.$queryRaw<TinyCardRow[]>`
      SELECT
        m."entityId",
        m.variant,
        m.width,
        m.height,
        m.size,
        LEAST(m.width, m.height) AS "shortSide"
      FROM "Media" m
      WHERE m."entityType" = ${USER_ENTITY_TYPE}
        AND m.collection = ${PROFILE_CARD_COLLECTION}
        AND m.variant IN ('card', 'original')
        AND m.width IS NOT NULL
        AND m.height IS NOT NULL
        AND LEAST(m.width, m.height) < ${MIN_SHORT_SIDE}
      ORDER BY "shortSide" ASC, m."entityId" ASC
    `;

    const byUser = new Map<
      string,
      { shortSide: number; size: number; variants: string[] }
    >();

    for (const row of rows) {
      const short = Number(row.shortSide);
      const prev = byUser.get(row.entityId);
      if (!prev) {
        byUser.set(row.entityId, {
          shortSide: short,
          size: row.size,
          variants: [row.variant],
        });
      } else {
        prev.shortSide = Math.min(prev.shortSide, short);
        prev.size = Math.max(prev.size, row.size);
        if (!prev.variants.includes(row.variant)) {
          prev.variants.push(row.variant);
        }
      }
    }

    const userIds = [...byUser.keys()];
    console.log(
      `Найдено ${userIds.length} анкет с profileCard короче ${MIN_SHORT_SIDE}px` +
        (apply ? '' : ' (dry-run, передай --apply чтобы удалить)'),
    );

    for (const userId of userIds.slice(0, 30)) {
      const info = byUser.get(userId)!;
      console.log(
        `  ${userId} short=${info.shortSide}px size≈${info.size}B variants=${info.variants.join(',')}`,
      );
    }
    if (userIds.length > 30) {
      console.log(`  … и ещё ${userIds.length - 30}`);
    }

    if (!apply) {
      return;
    }

    let deleted = 0;
    for (const userId of userIds) {
      await media.deleteCollection({
        entityType: USER_ENTITY_TYPE,
        entityId: userId,
        collection: PROFILE_CARD_COLLECTION,
      });
      await prisma.user.update({
        where: { id: userId },
        data: { updatedAt: new Date() },
      });
      deleted += 1;
    }

    console.log(
      `Удалено profileCard у ${deleted} пользователей (avatar не трогали)`,
    );
  } finally {
    await app.get(PrismaService).$disconnect();
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
