import {
  mapAppRolesToAnalytics,
  sanitizeAnalyticsProps,
} from './analytics.constants';

describe('sanitizeAnalyticsProps', () => {
  it('strips sensitive keys and keeps ids', () => {
    expect(
      sanitizeAnalyticsProps({
        password: 'secret',
        token: 'abc',
        message: 'hi',
        email: 'a@b.c',
        game_id: 'cuid',
        is_paid: true,
        systems: ['D&D'],
      }),
    ).toEqual({
      game_id: 'cuid',
      is_paid: true,
      systems: ['D&D'],
    });
  });
});

describe('mapAppRolesToAnalytics', () => {
  it('maps Russian roles', () => {
    expect(mapAppRolesToAnalytics(['Игрок', 'Мастер'])).toEqual([
      'player',
      'gm',
    ]);
  });
});
