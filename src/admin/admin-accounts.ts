import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ROLE_LABELS,
  buildAdminSessionUser,
  type AdminSessionUser,
} from './admin-access';

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 10;

export const ADMIN_SESSIONS_TABLE = 'admin_sessions';

type ValidationErrorCtor = new (
  propertyErrors: Record<string, { message: string; type?: string }>,
) => Error;

type RecordJson = { params?: Record<string, unknown> } | undefined;
type ActionResponse = {
  record?: RecordJson;
  records?: RecordJson[];
  [key: string]: unknown;
};
type ActionRequest = {
  method?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};
type ActionContext = {
  record?: { params?: Record<string, unknown> };
  revokeAdminSessions?: boolean;
  [key: string]: unknown;
};

const isPost = (request: ActionRequest) =>
  (request.method ?? '').toLowerCase() === 'post';

const isTruthyParam = (value: unknown) => value === true || value === 'true';

export async function authenticateAdmin(
  prisma: PrismaService,
  configService: ConfigService,
  email: string,
  password: string,
): Promise<AdminSessionUser | null> {
  const envEmail = configService.get<string>('ADMIN_EMAIL');
  const envPassword = configService.get<string>('ADMIN_PASSWORD');
  if (
    envEmail &&
    envPassword &&
    email === envEmail &&
    password === envPassword
  ) {
    return buildAdminSessionUser({ email: envEmail, role: 'SUPERADMIN' });
  }

  const account = await prisma.adminAccount.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!account?.isActive) return null;
  if (account.role === 'PARTNER' && !account.partnerId) return null;
  if (!(await bcrypt.compare(password, account.passwordHash))) return null;

  await prisma.adminAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });
  return buildAdminSessionUser({
    email: account.email,
    role: account.role,
    accountId: account.id,
    partnerId: account.partnerId,
    name: account.name,
  });
}

/** Role changes and deactivation must not wait for the 7-day session cookie to expire. */
export async function revokeAdminAccountSessions(
  prisma: PrismaService,
  accountIds: string[],
): Promise<void> {
  if (!accountIds.length) return;
  await prisma.$executeRawUnsafe(
    `DELETE FROM "${ADMIN_SESSIONS_TABLE}" WHERE sess -> 'adminUser' ->> 'accountId' = ANY($1::text[])`,
    accountIds,
  );
}

function stripPasswordHash(json: RecordJson): void {
  if (json?.params) delete json.params.passwordHash;
}

function stripPasswordHashAfter(response: ActionResponse): ActionResponse {
  stripPasswordHash(response.record);
  response.records?.forEach(stripPasswordHash);
  return response;
}

export function buildAdminAccountResourceOptions(
  prisma: PrismaService,
  ValidationError: ValidationErrorCtor,
) {
  const preparePayload =
    (passwordRequired: boolean) =>
    async (request: ActionRequest, context: ActionContext) => {
      if (!isPost(request) || !request.payload) {
        return request;
      }
      const payload = { ...request.payload };
      const nextPassword =
        typeof payload.password === 'string' ? payload.password : '';
      delete payload.password;
      delete payload.passwordHash;

      if (nextPassword) {
        if (nextPassword.length < MIN_PASSWORD_LENGTH) {
          throw new ValidationError({
            password: { message: `Минимум ${MIN_PASSWORD_LENGTH} символов` },
          });
        }
        payload.passwordHash = await bcrypt.hash(nextPassword, SALT_ROUNDS);
      } else if (passwordRequired) {
        throw new ValidationError({ password: { message: 'Задай пароль' } });
      }

      if (typeof payload.email === 'string') {
        payload.email = payload.email.trim().toLowerCase();
      }

      const previous = context.record?.params;
      const role = payload.role ?? previous?.role;
      // The form edits the relation (`partner`), AdminJS sends the record id there.
      const submitted =
        payload.partner !== undefined ? payload.partner : payload.partnerId;
      const partnerId =
        submitted === undefined
          ? (previous?.partnerId ?? null)
          : submitted === '' || submitted === null
            ? null
            : String(submitted);
      if (role === 'PARTNER' && !partnerId) {
        throw new ValidationError({
          partner: {
            message: 'Выбери партнёра, чьи новости ведёт этот логин',
          },
        });
      }
      payload.partner = role === 'PARTNER' ? partnerId : null;
      payload.partnerId = payload.partner;

      if (previous) {
        context.revokeAdminSessions =
          Boolean(payload.passwordHash) ||
          (payload.role !== undefined && payload.role !== previous.role) ||
          (payload.partnerId !== undefined &&
            (payload.partnerId || null) !== (previous.partnerId || null)) ||
          (payload.isActive !== undefined &&
            isTruthyParam(payload.isActive) !==
              isTruthyParam(previous.isActive));
      }
      return { ...request, payload };
    };

  const revokeAfter =
    (always: boolean) =>
    async (
      response: ActionResponse,
      request: ActionRequest,
      context: ActionContext,
    ) => {
      if (isPost(request) && (always || context.revokeAdminSessions)) {
        const ids = [response.record, ...(response.records ?? [])]
          .map((json) => json?.params?.id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          );
        await revokeAdminAccountSessions(prisma, ids);
      }
      return stripPasswordHashAfter(response);
    };

  return {
    navigation: { name: 'Доступ', icon: 'Lock' },
    titleProperty: 'email',
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: [
      'email',
      'name',
      'role',
      'partner',
      'isActive',
      'lastLoginAt',
    ],
    filterProperties: ['email', 'name', 'role', 'partner', 'isActive'],
    showProperties: [
      'id',
      'email',
      'name',
      'role',
      'partner',
      'isActive',
      'lastLoginAt',
      'createdAt',
      'updatedAt',
    ],
    editProperties: [
      'email',
      'name',
      'role',
      'partner',
      'isActive',
      'password',
    ],
    properties: {
      partnerId: { isVisible: false },
      partner: {
        description:
          'Только для роли «Партнёр»: чьи новости публикует этот логин.',
      },
      passwordHash: { isVisible: false },
      password: {
        type: 'password',
        isVisible: { list: false, show: false, filter: false, edit: true },
        description: `Не короче ${MIN_PASSWORD_LENGTH} символов. При правке оставь пустым, чтобы не менять.`,
      },
      role: {
        availableValues: Object.entries(ADMIN_ROLE_LABELS).map(
          ([value, label]) => ({
            value,
            label,
          }),
        ),
      },
    },
    actions: {
      list: { after: stripPasswordHashAfter },
      show: { after: stripPasswordHashAfter },
      new: { before: preparePayload(true), after: stripPasswordHashAfter },
      edit: { before: preparePayload(false), after: revokeAfter(false) },
      delete: { after: revokeAfter(true) },
      bulkDelete: { after: revokeAfter(true) },
    },
  };
}
