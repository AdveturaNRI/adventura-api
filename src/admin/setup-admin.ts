import * as fs from 'fs';
import * as path from 'path';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { loadEsmModule } from '../common/load-esm-module';
import type { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import {
  createGrantRewardsPageHandler,
  handleGrantRewardRecordCreate,
  handleUnlockCosmeticRecordCreate,
  searchUsers,
  toUserSearchRecords,
} from './grant-rewards.handler';
import { ADMIN_LOCALE_RU } from './locale-ru';
import {
  BADGE_SELECT_OPTIONS,
  COSMETIC_ITEM_SELECT_OPTIONS,
  COSMETIC_KIND_SELECT_OPTIONS,
  DICE_SELECT_OPTIONS,
} from './rewards-catalog';

type AdminJSModule = typeof import('adminjs') & {
  default: typeof import('adminjs').default;
};

function resolveAdminComponent(name: string): string {
  const candidates = [
    path.join(__dirname, 'components', name),
    path.join(process.cwd(), 'src/admin/components', name),
  ];
  const extensions = ['.jsx', '.js', '.tsx', '.ts'];
  for (const candidate of candidates) {
    if (extensions.some((ext) => fs.existsSync(candidate + ext))) {
      return candidate;
    }
  }
  return candidates[0];
}

const hiddenOnEdit = {
  list: true,
  show: true,
  edit: false,
  filter: true,
} as const;

export async function setupAdmin(
  app: INestApplication,
  configService: ConfigService,
  prisma: PrismaService,
) {
  const [adminjsMod, { default: AdminJSExpress }, prismaAdapter] = await Promise.all([
    loadEsmModule<AdminJSModule>('adminjs'),
    loadEsmModule<{ default: typeof import('@adminjs/express').default }>('@adminjs/express'),
    loadEsmModule<typeof import('@adminjs/prisma')>('@adminjs/prisma'),
  ]);
  const AdminJS = adminjsMod.default;
  const { ComponentLoader } = adminjsMod;
  const { Database, Resource, getModelByName } = prismaAdapter;
  const rewards = app.get(RewardsService);

  AdminJS.registerAdapter({ Database, Resource });

  const componentLoader = new ComponentLoader();
  const GrantRewardsComponent = componentLoader.add(
    'GrantRewards',
    resolveAdminComponent('grant-rewards'),
  );

  const admin = new AdminJS({
    rootPath: '/admin',
    componentLoader,
    branding: {
      companyName: 'Adventura Admin',
      withMadeWithLove: false,
    },
    locale: {
      language: 'ru',
      availableLanguages: ['ru'],
      translations: {
        ru: ADMIN_LOCALE_RU,
      },
    },
    pages: {
      grantRewards: {
        icon: 'Gift',
        component: GrantRewardsComponent,
        handler: createGrantRewardsPageHandler(prisma, rewards),
      },
    },
    resources: [
      {
        resource: { model: getModelByName('User'), client: prisma },
        options: {
          navigation: { name: 'Пользователи', icon: 'User' },
          titleProperty: 'nickname',
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
            visibleBadgeTypes: {
              isVisible: {
                list: false,
                show: true,
                edit: false,
                filter: false,
              },
            },
          },
          actions: {
            search: {
              handler: async (request: any) => {
                const query = String(request.params?.query ?? request.query?.query ?? '').trim();
                const users = await searchUsers(prisma, query);
                return { records: toUserSearchRecords(users) };
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
        resource: { model: getModelByName('UserReward'), client: prisma },
        options: {
          navigation: { name: 'Награды', icon: 'Award' },
          listProperties: [
            'id',
            'user',
            'badgeType',
            'customDiceSkinId',
            'bonusCharacterSlots',
            'grantedAt',
          ],
          properties: {
            badgeType: {
              availableValues: BADGE_SELECT_OPTIONS,
            },
            customDiceSkinId: {
              availableValues: DICE_SELECT_OPTIONS,
              isVisible: hiddenOnEdit,
            },
            bonusCharacterSlots: {
              isVisible: hiddenOnEdit,
            },
            grantedAt: {
              isVisible: hiddenOnEdit,
            },
          },
          actions: {
            new: {
              component: GrantRewardsComponent,
              handler: (request: any, _response: any, context: any) =>
                handleGrantRewardRecordCreate(request, context, rewards),
            },
          },
        },
      },
      {
        resource: { model: getModelByName('UserCosmeticUnlock'), client: prisma },
        options: {
          navigation: { name: 'Награды', icon: 'Award' },
          listProperties: ['id', 'user', 'kind', 'itemId', 'grantedAt'],
          properties: {
            kind: {
              availableValues: COSMETIC_KIND_SELECT_OPTIONS,
            },
            itemId: {
              availableValues: COSMETIC_ITEM_SELECT_OPTIONS,
            },
            grantedAt: {
              isVisible: hiddenOnEdit,
            },
          },
          actions: {
            new: {
              component: GrantRewardsComponent,
              handler: (request: any, _response: any, context: any) =>
                handleUnlockCosmeticRecordCreate(request, context, rewards, prisma),
            },
          },
        },
      },
      {
        resource: { model: getModelByName('DailyUsageCounter'), client: prisma },
        options: {
          navigation: { name: 'Награды', icon: 'Award' },
          listProperties: ['userId', 'kind', 'day', 'count'],
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

  if (process.env.NODE_ENV === 'production') {
    await admin.initialize();
  } else {
    try {
      fs.unlinkSync(path.join(process.cwd(), '.adminjs', 'bundle.js'));
    } catch {
      // first run, nothing to drop
    }
    await admin.watch();
  }

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
