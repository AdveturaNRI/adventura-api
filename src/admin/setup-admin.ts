import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { loadEsmModule } from '../common/load-esm-module';
import type { PrismaService } from '../prisma/prisma.service';

export async function setupAdmin(
  app: INestApplication,
  configService: ConfigService,
  prisma: PrismaService,
) {
  const [{ default: AdminJS }, { default: AdminJSExpress }, prismaAdapter] =
    await Promise.all([
      loadEsmModule<{ default: typeof import('adminjs').default }>('adminjs'),
      loadEsmModule<{ default: typeof import('@adminjs/express').default }>(
        '@adminjs/express',
      ),
      loadEsmModule<typeof import('@adminjs/prisma')>('@adminjs/prisma'),
    ]);
  const { Database, Resource, getModelByName } = prismaAdapter;

  AdminJS.registerAdapter({ Database, Resource });

  const admin = new AdminJS({
    rootPath: '/admin',
    branding: {
      companyName: 'Adventura Admin',
      withMadeWithLove: false,
    },
    locale: {
      language: 'ru',
      availableLanguages: ['ru', 'en'],
    },
    resources: [
      {
        resource: { model: getModelByName('User'), client: prisma },
        options: {
          navigation: { name: 'Пользователи', icon: 'User' },
          listProperties: ['id', 'email', 'nickname', 'isGuest', 'location', 'createdAt'],
          properties: {
            passwordHash: {
              isVisible: {
                list: false,
                show: false,
                edit: false,
                filter: false,
              },
            },
            refreshTokens: {
              isVisible: {
                list: false,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
        },
      },
      {
        resource: { model: getModelByName('RefreshToken'), client: prisma },
        options: {
          navigation: { name: 'Сессии', icon: 'Key' },
          listProperties: ['id', 'userId', 'expiresAt', 'createdAt'],
          properties: {
            tokenHash: {
              isVisible: {
                list: false,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
        },
      },
      {
        resource: { model: getModelByName('Status'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('ExperienceType'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('GameSystem'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'description', 'sortOrder', 'isOfficial'],
          properties: {
            description: {
              isRequired: false,
            },
          },
        },
      },
      {
        resource: { model: getModelByName('Country'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'code', 'name', 'sortOrder'],
        },
      },
      {
        resource: { model: getModelByName('City'), client: prisma },
        options: {
          navigation: { name: 'Справочники', icon: 'Book' },
          listProperties: ['id', 'name', 'countryId', 'region', 'population', 'isActive'],
        },
      },
      {
        resource: { model: getModelByName('UserStatus'), client: prisma },
        options: {
          navigation: { name: 'Связи', icon: 'Link' },
          listProperties: ['userId', 'statusId', 'createdAt'],
        },
      },
      {
        resource: { model: getModelByName('UserExperience'), client: prisma },
        options: {
          navigation: { name: 'Связи', icon: 'Link' },
          listProperties: ['userId', 'experienceTypeId', 'createdAt'],
        },
      },
      {
        resource: { model: getModelByName('Media'), client: prisma },
        options: {
          navigation: { name: 'Медиа', icon: 'Image' },
          listProperties: [
            'id',
            'entityType',
            'entityId',
            'collection',
            'variant',
            'mimeType',
            'size',
          ],
        },
      },
    ],
  });

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email: string, password: string) => {
        const adminEmail = configService.get<string>('ADMIN_EMAIL');
        const adminPassword = configService.get<string>('ADMIN_PASSWORD');

        if (
          email === adminEmail &&
          password === adminPassword &&
          adminEmail &&
          adminPassword
        ) {
          return { email };
        }

        return null;
      },
      cookieName: 'adventura_admin',
      cookiePassword: configService.getOrThrow<string>('ADMIN_COOKIE_SECRET'),
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: configService.getOrThrow<string>('ADMIN_SESSION_SECRET'),
    },
  );

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(admin.options.rootPath, router);
}
