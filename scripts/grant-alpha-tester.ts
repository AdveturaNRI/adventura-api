import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RewardsService } from '../src/rewards/rewards.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const rewards = app.get(RewardsService);
    const cutoff = process.argv[2];
    const result = await rewards.grantAlphaTesters(cutoff);
    console.log(
      `Alpha Pioneer: отсечка ${result.cutoff}, просмотрено ${result.scanned}, выдано ${result.granted}, уже было ${result.skipped}`,
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
