export const ANALYTICS_EVENTS = {
  USER_REGISTERED: 'user_registered',
  USER_SESSION_STARTED: 'user_session_started',
  USER_ROLE_SELECTED: 'user_role_selected',
  PLAYER_PROFILE_CREATED: 'player_profile_created',
  PLAYER_PROFILE_VIEWED: 'player_profile_viewed',
  PLAYER_PROFILE_TRANSITION: 'player_profile_transition',
  PLAYER_PROFILE_CONTACTED: 'player_profile_contacted',
  PLAYER_MATCH_COMPLETED: 'player_match_completed',
  GAME_LISTING_CREATED: 'game_listing_created',
  GAME_LISTING_VIEWED: 'game_listing_viewed',
  GAME_LISTING_TRANSITION: 'game_listing_transition',
  GAME_APPLICATION_SENT: 'game_application_sent',
  GAME_APPLICATION_APPROVED: 'game_application_approved',
  GAME_APPLICATION_REJECTED: 'game_application_rejected',
  GAME_SESSION_STARTED: 'game_session_started',
  GAME_SESSION_COMPLETED: 'game_session_completed',
  CLUB_PROFILE_CREATED: 'club_profile_created',
  CLUB_PROFILE_UPDATED: 'club_profile_updated',
  CLUB_GAME_LINKED: 'club_game_linked',
  CLUB_PAGE_VIEWED: 'club_page_viewed',
  CLUB_PAGE_TRANSITION: 'club_page_transition',
  /** Hourly platform gauges: users_total, profiles_active, users_online. */
  PLATFORM_SNAPSHOT: 'platform_snapshot',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsEntityKind = 'club' | 'player' | 'game';

export const VIEW_EVENT_BY_ENTITY: Record<AnalyticsEntityKind, AnalyticsEventName> =
  {
    club: ANALYTICS_EVENTS.CLUB_PAGE_VIEWED,
    player: ANALYTICS_EVENTS.PLAYER_PROFILE_VIEWED,
    game: ANALYTICS_EVENTS.GAME_LISTING_VIEWED,
  };

export const TRANSITION_EVENT_BY_ENTITY: Record<
  AnalyticsEntityKind,
  AnalyticsEventName
> = {
  club: ANALYTICS_EVENTS.CLUB_PAGE_TRANSITION,
  player: ANALYTICS_EVENTS.PLAYER_PROFILE_TRANSITION,
  game: ANALYTICS_EVENTS.GAME_LISTING_TRANSITION,
};

/** One view / transition per user+entity+id per rolling hour. */
export const ENTITY_STATS_RATE_LIMIT_MS = 60 * 60 * 1000;

export const DAILY_METRICS = {
  SESSIONS_CREATED: 'sessions_created',
  SESSIONS_COMPLETED: 'sessions_completed',
  LISTINGS_FREE: 'listings_free',
  LISTINGS_PAID: 'listings_paid',
  PROFILES_ACTIVE: 'profiles_active',
  PROFILES_FREE_ONLY: 'profiles_free_only',
  USERS_TOTAL: 'users_total',
  USERS_ONLINE: 'users_online',
  OPEN_SEATS: 'open_seats',
  LIQUIDITY: 'liquidity',
  DAU: 'dau',
  WAU: 'wau',
  MAU: 'mau',
  STICKINESS: 'stickiness',
  RETENTION_D1: 'retention_d1',
  RETENTION_D7: 'retention_d7',
  RETENTION_D30: 'retention_d30',
  MATCH_RATE: 'match_rate',
  AVG_TIME_TO_MATCH_MS: 'avg_time_to_match_ms',
  APPLY_APPROVE_RATE: 'apply_approve_rate',
  AVG_FILL_RATE: 'avg_fill_rate',
  AVG_TIME_TO_FILL_MS: 'avg_time_to_fill_ms',
} as const;

export type DailyMetricName = (typeof DAILY_METRICS)[keyof typeof DAILY_METRICS];

/** User counts as online if lastSeenAt within this window. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

const SENSITIVE_KEY =
  /^(password|passwordhash|token|accesstoken|refreshtoken|authorization|secret|cookie|message|body|content|email|phone|p256dh|auth)$/i;

export function sanitizeAnalyticsProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return {};
  }

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item) =>
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      );
      continue;
    }
  }

  return out;
}

export function mapAppRolesToAnalytics(roles: string[]): string[] {
  const mapped = new Set<string>();

  for (const role of roles) {
    if (role === 'Игрок') {
      mapped.add('player');
    } else if (role === 'Мастер') {
      mapped.add('gm');
    } else if (role === 'club_owner' || role === 'player' || role === 'gm') {
      mapped.add(role);
    }
  }

  return [...mapped];
}
