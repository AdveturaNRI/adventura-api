import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { setupAdmin } from './admin/setup-admin';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

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

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap();
