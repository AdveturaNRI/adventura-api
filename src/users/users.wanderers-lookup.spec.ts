import { NotFoundException } from '@nestjs/common';

jest.mock('../chats/chats.service', () => ({
  ChatsService: class ChatsService {},
}));

jest.mock('../media/media.service', () => ({
  MediaService: class MediaService {},
}));

jest.mock('../image/image-processor.service', () => ({
  ImageProcessorService: class ImageProcessorService {},
}));

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));

jest.mock('../notification-sounds/notification-sounds.service', () => ({
  NotificationSoundsService: class NotificationSoundsService {},
}));

jest.mock('../analytics/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

jest.mock('../marketing/conversions/marketing-conversions.service', () => ({
  MarketingConversionsService: class MarketingConversionsService {},
}));

jest.mock('../realtime/realtime.emitter', () => ({
  RealtimeEmitter: class RealtimeEmitter {},
}));

jest.mock('../rewards/rewards.service', () => ({
  RewardsService: class RewardsService {},
}));

import { UsersService } from './users.service';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-private',
    email: 'hidden@example.com',
    nickname: 'HiddenHero',
    isGuest: false,
    availability: null,
    age: 25,
    location: null,
    cityId: null,
    playsOnline: false,
    timezone: 'Europe/Moscow',
    isPublic: false,
    systems: ['D&D 5e'],
    readyToLearnNew: false,
    openToAnySystem: false,
    prefersFreeOnly: false,
    gameCostFormat: null,
    sessionPriceKind: null,
    sessionPriceMin: null,
    sessionPriceMax: null,
    playerPaymentFormat: null,
    playerBudgetKind: null,
    playerBudgetMin: null,
    playerBudgetMax: null,
    about: null,
    description: null,
    roles: ['player'],
    questionnaireStep: 8,
    notificationSoundsEnabled: true,
    notificationSoundPresetId: null,
    useCustomNotificationSound: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSeenAt: null,
    equippedAvatarFrameId: null,
    equippedQuestionnaireAuraId: null,
    visibleBadgeTypes: null,
    rewards: [],
    cosmeticUnlocks: [],
    notificationSoundPreset: null,
    statuses: [],
    experiences: [],
    city: null,
    userCities: [],
    ...overrides,
  };
}

describe('UsersService wanderers private lookup', () => {
  const createService = () => {
    const prisma = {
      userBlock: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      wandererReaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      conversationParticipant: {
        findFirst: jest.fn(),
      },
    };

    const mediaService = {
      getCollection: jest.fn().mockResolvedValue([]),
      getCollectionUrls: jest.fn().mockResolvedValue({}),
    };

    const rewardsService = {
      buildPerks: jest.fn().mockReturnValue({
        visibleBadges: [],
        avatarFrameId: null,
        questionnaireAuraId: null,
      }),
    };

    const realtime = {
      isPresent: jest.fn().mockReturnValue(false),
    };

    const notificationsService = {
      notifyFavoriteReturned: jest.fn().mockResolvedValue(undefined),
      notifyFavoriteReceived: jest.fn().mockResolvedValue(undefined),
    };

    const chatsService = {
      syncFavoriteFlagsBetween: jest.fn().mockResolvedValue(undefined),
    };

    const service = new UsersService(
      prisma as never,
      mediaService as never,
      {} as never,
      notificationsService as never,
      {} as never,
      {} as never,
      {} as never,
      chatsService as never,
      realtime as never,
      rewardsService as never,
    );

    return { service, prisma, chatsService };
  };

  it('returns a private user on exact nickname match', async () => {
    const { service, prisma } = createService();
    const privateUser = baseUser();

    prisma.user.findFirst.mockResolvedValue(privateUser);
    prisma.user.findMany.mockResolvedValue([]);

    const results = await service.searchWanderers('viewer-1', 'hiddenhero');

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nickname: { equals: 'hiddenhero', mode: 'insensitive' },
        }),
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublic: true }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.nickname).toBe('HiddenHero');
  });

  it('does not return a private user on partial nickname match', async () => {
    const { service, prisma } = createService();

    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);

    const results = await service.searchWanderers('viewer-1', 'Hidden');

    expect(results).toEqual([]);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          nickname: { equals: 'Hidden', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('returns a private card by id without a shared conversation', async () => {
    const { service, prisma } = createService();
    const privateUser = baseUser();

    prisma.user.findUnique.mockResolvedValue(privateUser);

    const card = await service.getWandererCard('viewer-1', privateUser.id);

    expect(card.nickname).toBe('HiddenHero');
    expect(prisma.conversationParticipant.findFirst).not.toHaveBeenCalled();
  });

  it('still 404s when the user id does not exist', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getWandererCard('viewer-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows favorite reaction on a private profile (chat / direct link)', async () => {
    const { service, prisma, chatsService } = createService();
    const privateUser = baseUser();

    prisma.user.findUnique.mockResolvedValue({ id: privateUser.id });

    await expect(
      service.upsertWandererReaction('viewer-1', privateUser.id, 'favorite'),
    ).resolves.toEqual({ targetUserId: privateUser.id, type: 'favorite' });

    expect(prisma.wandererReaction.upsert).toHaveBeenCalled();
    expect(chatsService.syncFavoriteFlagsBetween).toHaveBeenCalledWith(
      'viewer-1',
      privateUser.id,
    );
  });

  it('still 404s favorite reaction when the user id does not exist', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.upsertWandererReaction('viewer-1', 'missing', 'favorite'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
