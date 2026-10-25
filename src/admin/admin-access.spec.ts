import {
  ADMIN_FORBIDDEN_MESSAGE,
  applyAdminAccess,
  buildAdminSessionUser,
  canAccessSection,
} from './admin-access';

const manager = buildAdminSessionUser({ email: 'm@a.ru', role: 'MANAGER' });
const superadmin = buildAdminSessionUser({
  email: 's@a.ru',
  role: 'SUPERADMIN',
});

type Fn = (...args: unknown[]) => unknown;

describe('admin access', () => {
  it('limits MANAGER to its sections', () => {
    expect(canAccessSection(manager, 'users')).toBe(true);
    expect(canAccessSection(manager, 'marketing')).toBe(true);
    expect(canAccessSection(manager, 'sessions')).toBe(false);
    expect(canAccessSection(manager, 'communications')).toBe(false);
    expect(canAccessSection(manager, 'access')).toBe(false);
    expect(canAccessSection(manager, undefined)).toBe(false);
  });

  it('lets SUPERADMIN everywhere and denies sessions without a role', () => {
    expect(canAccessSection(superadmin, 'access')).toBe(true);
    expect(canAccessSection(superadmin, undefined)).toBe(true);
    expect(canAccessSection({ email: 'legacy@a.ru' }, 'users')).toBe(false);
    expect(canAccessSection(undefined, 'users')).toBe(false);
  });

  it('lists only allowed pages for the sidebar', () => {
    expect(manager.allowedPages).toEqual(
      expect.arrayContaining([
        'grantRewards',
        'notificationSounds',
        'marketingLandings',
        'marketingCampaigns',
        'marketingAnalytics',
        'welcomeLanding',
      ]),
    );
    expect(manager.allowedPages).not.toContain('broadcasts');
    expect(manager.allowedPages).not.toContain('metrikaSettings');
    expect(manager.title).toBe('m@a.ru · Менеджер');
  });

  it('guards resource actions without mutating shared action objects', async () => {
    const shared = { new: { isAccessible: false } };
    const before = jest.fn((request: unknown) => request);
    const options = applyAdminAccess({
      resources: [
        { options: { navigation: { name: 'Сессии' }, actions: shared } },
        {
          options: {
            navigation: { name: 'Пользователи' },
            actions: { ...shared, edit: { before } },
          },
        },
      ],
    });
    const [sessions, users] = options.resources.map(
      (r) =>
        r.options.actions as unknown as Record<
          string,
          { isAccessible: Fn; before?: Fn }
        >,
    );

    expect(shared.new.isAccessible).toBe(false);
    expect(sessions.list.isAccessible({ currentAdmin: manager })).toBe(false);
    expect(sessions.list.isAccessible({ currentAdmin: superadmin })).toBe(true);
    expect(users.list.isAccessible({ currentAdmin: manager })).toBe(true);
    expect(users.new.isAccessible({ currentAdmin: superadmin })).toBe(false);

    await users.edit.before?.({ payload: {} }, { currentAdmin: manager });
    expect(before).toHaveBeenCalledTimes(1);
  });

  it('skips before hooks of closed resources', async () => {
    const before = jest.fn((request: unknown) => request);
    const options = applyAdminAccess({
      resources: [
        {
          options: {
            navigation: { name: 'Связи' },
            actions: { new: { before } },
          },
        },
      ],
    });
    const actions = options.resources[0].options.actions as unknown as Record<
      string,
      { before: Fn }
    >;
    await actions.new.before({ payload: {} }, { currentAdmin: manager });
    expect(before).not.toHaveBeenCalled();
  });

  it('guards page and dashboard handlers', () => {
    const send = jest.fn<{ ok: boolean }, unknown[]>(() => ({ ok: true }));
    const options = applyAdminAccess({
      pages: {
        broadcasts: { handler: send },
        grantRewards: { handler: send },
      },
      dashboard: { handler: send },
    });

    expect(
      options.pages.broadcasts.handler({}, {}, { currentAdmin: manager }),
    ).toMatchObject({
      forbidden: true,
      error: ADMIN_FORBIDDEN_MESSAGE,
    });
    expect(send).not.toHaveBeenCalled();

    expect(
      options.pages.grantRewards.handler({}, {}, { currentAdmin: manager }),
    ).toEqual({
      ok: true,
    });
    expect(
      options.dashboard.handler({}, {}, { currentAdmin: manager }),
    ).toEqual({ ok: true });
    expect(
      options.pages.broadcasts.handler({}, {}, { currentAdmin: superadmin }),
    ).toEqual({
      ok: true,
    });
  });
});
