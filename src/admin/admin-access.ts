import type { AdminRole } from '@prisma/client';

export const ADMIN_SECTIONS = [
  'dashboard',
  'marketing',
  'users',
  'sessions',
  'dictionaries',
  'links',
  'rewards',
  'publications',
  'media',
  'communications',
  'integrations',
  'access',
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const ADMIN_ROLE_SECTIONS: Record<AdminRole, readonly AdminSection[]> = {
  SUPERADMIN: ADMIN_SECTIONS,
  MANAGER: [
    'dashboard',
    'marketing',
    'users',
    'dictionaries',
    'rewards',
    'publications',
    'media',
  ],
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPERADMIN: 'Суперадмин',
  MANAGER: 'Менеджер',
};

/** Resource `navigation.name` → section. Unknown groups are closed for everyone but SUPERADMIN. */
export const ADMIN_NAVIGATION_SECTIONS: Record<string, AdminSection> = {
  Аналитика: 'dashboard',
  Маркетинг: 'marketing',
  Пользователи: 'users',
  Сессии: 'sessions',
  Справочники: 'dictionaries',
  Связи: 'links',
  Награды: 'rewards',
  Публикации: 'publications',
  Медиа: 'media',
  Доступ: 'access',
};

/** AdminJS `pages` key → section. Unknown pages are closed for everyone but SUPERADMIN. */
export const ADMIN_PAGE_SECTIONS: Record<string, AdminSection> = {
  grantRewards: 'rewards',
  notificationSounds: 'dictionaries',
  marketingLandings: 'marketing',
  marketingCampaigns: 'marketing',
  marketingAnalytics: 'marketing',
  welcomeLanding: 'marketing',
  broadcasts: 'communications',
  siteAnnouncements: 'communications',
  pushSettings: 'communications',
  metrikaSettings: 'integrations',
  vkAdsPixelSettings: 'integrations',
};

export const ADMIN_FORBIDDEN_MESSAGE = 'Нет доступа к этому разделу';

export type AdminSessionUser = {
  email: string;
  title: string;
  role: AdminRole;
  accountId?: string;
  /** Read by the SidebarPages override: the frontend bundle has no access matrix. */
  allowedPages: string[];
};

export function buildAdminSessionUser(input: {
  email: string;
  role: AdminRole;
  accountId?: string;
  name?: string | null;
}): AdminSessionUser {
  const sections = ADMIN_ROLE_SECTIONS[input.role];
  return {
    email: input.email,
    title: `${input.name?.trim() || input.email} · ${ADMIN_ROLE_LABELS[input.role]}`,
    role: input.role,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    allowedPages: Object.entries(ADMIN_PAGE_SECTIONS)
      .filter(([, section]) => sections.includes(section))
      .map(([page]) => page),
  };
}

function roleOf(currentAdmin: unknown): AdminRole | null {
  const role = (currentAdmin as { role?: unknown } | null | undefined)?.role;
  return typeof role === 'string' && role in ADMIN_ROLE_SECTIONS
    ? (role as AdminRole)
    : null;
}

export function canAccessSection(
  currentAdmin: unknown,
  section: AdminSection | undefined,
): boolean {
  const role = roleOf(currentAdmin);
  if (!role) return false;
  if (role === 'SUPERADMIN') return true;
  return section !== undefined && ADMIN_ROLE_SECTIONS[role].includes(section);
}

type AccessContext = { currentAdmin?: unknown };
type Hook = (request: unknown, context: AccessContext) => unknown;
type ActionOptions = {
  isAccessible?: boolean | ((context: AccessContext) => boolean);
  before?: Hook | Hook[];
  [key: string]: unknown;
};
type ResourceEntry = {
  options?: {
    navigation?: { name?: string } | null;
    actions?: Record<string, ActionOptions | undefined>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type PageEntry = {
  handler?: (
    request: unknown,
    response: unknown,
    context: AccessContext,
  ) => unknown;
  [key: string]: unknown;
};
type AdminOptionsShape = {
  resources?: ResourceEntry[];
  pages?: Record<string, PageEntry>;
  dashboard?: PageEntry;
};

const BUILT_IN_ACTIONS = [
  'list',
  'show',
  'new',
  'edit',
  'delete',
  'bulkDelete',
  'search',
] as const;

function guardAction(
  action: ActionOptions,
  section: AdminSection | undefined,
): ActionOptions {
  const baseAccessible = action.isAccessible;
  const guarded: ActionOptions = {
    ...action,
    isAccessible: (context) =>
      canAccessSection(context?.currentAdmin, section) &&
      (typeof baseAccessible === 'function'
        ? baseAccessible(context)
        : baseAccessible !== false),
  };
  if (action.before) {
    // AdminJS runs `before` hooks ahead of the isAccessible check.
    const hooks = Array.isArray(action.before)
      ? action.before
      : [action.before];
    guarded.before = async (request, context) => {
      if (!canAccessSection(context?.currentAdmin, section)) return request;
      let next: unknown = request;
      for (const hook of hooks) {
        next = await hook(next, context);
      }
      return next;
    };
  }
  return guarded;
}

function guardPage(
  page: PageEntry,
  section: AdminSection | undefined,
): PageEntry {
  const { handler } = page;
  if (!handler) return page;
  return {
    ...page,
    handler: (request, response, context) => {
      if (!canAccessSection(context?.currentAdmin, section)) {
        return {
          forbidden: true,
          error: ADMIN_FORBIDDEN_MESSAGE,
          notice: { message: ADMIN_FORBIDDEN_MESSAGE, type: 'error' },
        };
      }
      return handler(request, response, context);
    },
  };
}

/**
 * Wraps every resource action, custom page and the dashboard with a role check.
 * Returns new action/page objects: shared constants (e.g. readOnlyActions) stay untouched.
 */
export function applyAdminAccess<T extends object>(options: T): T {
  const shape = options as AdminOptionsShape;

  shape.resources = shape.resources?.map((entry) => {
    const resourceOptions = entry.options ?? {};
    const section =
      ADMIN_NAVIGATION_SECTIONS[resourceOptions.navigation?.name ?? ''];
    const sourceActions = resourceOptions.actions ?? {};
    const actionNames = new Set<string>([
      ...BUILT_IN_ACTIONS,
      ...Object.keys(sourceActions),
    ]);
    const actions: Record<string, ActionOptions> = {};
    for (const name of actionNames) {
      actions[name] = guardAction(sourceActions[name] ?? {}, section);
    }
    return { ...entry, options: { ...resourceOptions, actions } };
  });

  if (shape.pages) {
    shape.pages = Object.fromEntries(
      Object.entries(shape.pages).map(([name, page]) => [
        name,
        guardPage(page, ADMIN_PAGE_SECTIONS[name]),
      ]),
    );
  }

  if (shape.dashboard) {
    shape.dashboard = guardPage(shape.dashboard, 'dashboard');
  }

  return options;
}
