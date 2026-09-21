import {
  buildRecipientWhere,
  normalizeBroadcastFilters,
} from './broadcast-filters';

describe('normalizeBroadcastFilters', () => {
  it('defaults to registered audience', () => {
    expect(normalizeBroadcastFilters(null).audience).toBe('registered');
    expect(normalizeBroadcastFilters({}).audience).toBe('registered');
  });

  it('maps legacy all to registered', () => {
    expect(normalizeBroadcastFilters({ audience: 'all' }).audience).toBe(
      'registered',
    );
  });

  it('parses everyone / guests / filtered', () => {
    expect(normalizeBroadcastFilters({ audience: 'everyone' }).audience).toBe(
      'everyone',
    );
    expect(normalizeBroadcastFilters({ audience: 'guests' }).audience).toBe(
      'guests',
    );
    expect(normalizeBroadcastFilters({ audience: 'filtered' }).audience).toBe(
      'filtered',
    );
  });

  it('parses filtered flags and roles', () => {
    const filters = normalizeBroadcastFilters({
      audience: 'filtered',
      emailVerified: 'true',
      rolesAny: 'master, player',
      lastSeenWithinDays: '14',
      hasPushSubscription: 'false',
    });
    expect(filters.audience).toBe('filtered');
    expect(filters.emailVerified).toBe(true);
    expect(filters.rolesAny).toEqual(['master', 'player']);
    expect(filters.lastSeenWithinDays).toBe(14);
    expect(filters.hasPushSubscription).toBe(false);
  });
});

describe('buildRecipientWhere', () => {
  it('everyone has no account-type restriction', () => {
    expect(buildRecipientWhere({ audience: 'everyone' })).toEqual({});
  });

  it('registered excludes guests', () => {
    expect(buildRecipientWhere({ audience: 'registered' })).toEqual({
      isGuest: false,
    });
    expect(buildRecipientWhere({ audience: 'all' })).toEqual({
      isGuest: false,
    });
  });

  it('guests only', () => {
    expect(buildRecipientWhere({ audience: 'guests' })).toEqual({
      isGuest: true,
    });
  });

  it('applies verified + roles filters', () => {
    const where = buildRecipientWhere({
      audience: 'filtered',
      emailVerified: true,
      rolesAny: ['master'],
    });
    expect(where.isGuest).toBe(false);
    expect(where.emailVerifiedAt).toEqual({ not: null });
    expect(where.roles).toEqual({ hasSome: ['master'] });
  });
});
