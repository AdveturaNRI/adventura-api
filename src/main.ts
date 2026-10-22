import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { setupAdmin } from './admin/setup-admin';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';
import { PrismaService } from './prisma/prisma.service';
import { RealtimeEmitter } from './realtime/realtime.emitter';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Needed for secure admin session cookies behind ingress / TLS terminator.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  // Reflect request Origin so any browser/client works with credentials.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalFilters(new MulterExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await setupAdmin(app, configService, app.get(PrismaService));

  // Multi-replica realtime: Socket.IO rooms + presence must go through Redis.
  // Without REDIS_URL, emits stay process-local (replicas=1 only).
  const redisUrl = configService.get<string>('REDIS_URL')?.trim();
  if (redisUrl) {
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis(redisUrl);
    app.useWebSocketAdapter(redisIoAdapter);
    await app.get(RealtimeEmitter).connectPresence(redisUrl);
  } else {
    logger.warn(
      'REDIS_URL unset — Socket.IO is single-node only. Keep api replicas=1.',
    );
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap();
