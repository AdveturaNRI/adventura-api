import { join } from 'path';

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

  const uploadsDir = configService.get<string>(
    'UPLOADS_DIR',
    join(process.cwd(), 'uploads'),
  );
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  app.setGlobalPrefix('api');

  const corsOrigins = configService.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((origin) => origin.trim()) : true,
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
