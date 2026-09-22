import { Prisma } from '@prisma/client';

import { MarketingConversionsService } from './marketing-conversions.service';

describe('MarketingConversionsService', () => {
  const createPrisma = () => ({
    marketingConversion: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    marketingCampaignVariant: { findFirst: jest.fn() },
    marketingLanding: { findFirst: jest.fn() },
    marketingAttributionTouch: { findFirst: jest.fn() },
  });

  it('is idempotent by idempotencyKey', async () => {
    const prisma = createPrisma();
    prisma.marketingConversion.findUnique.mockResolvedValue({
      id: 'conv1',
      occurredAt: new Date('2026-09-21T00:00:00.000Z'),
    });
    const service = new MarketingConversionsService(prisma as never);

    await expect(
      service.recordConversion({
        type: 'LANDING_VIEW',
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        idempotencyKey: 'k:1',
        props: { a: 1 },
      } as never),
    ).resolves.toMatchObject({
      recorded: false,
      reason: 'duplicate',
      conversionId: 'conv1',
    });

    expect(prisma.marketingConversion.create).not.toHaveBeenCalled();
  });

  it('treats concurrent unique violations as duplicates', async () => {
    const prisma = createPrisma();
    prisma.marketingConversion.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-race',
        occurredAt: new Date('2026-09-21T00:02:00.000Z'),
      });
    prisma.marketingConversion.count.mockResolvedValue(0);
    prisma.marketingLanding.findFirst.mockResolvedValue({ id: 'landing1' });
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingConversion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const service = new MarketingConversionsService(prisma as never);

    await expect(
      service.recordConversion({
        type: 'LANDING_VIEW',
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        landingSlug: 'autumn-games',
        idempotencyKey: 'k:race',
      } as never),
    ).resolves.toMatchObject({
      recorded: false,
      reason: 'duplicate',
      conversionId: 'conv-race',
    });
  });

  it('creates a conversion when no duplicate exists', async () => {
    const prisma = createPrisma();
    prisma.marketingConversion.findUnique.mockResolvedValue(null);
    prisma.marketingConversion.count.mockResolvedValue(0);
    prisma.marketingLanding.findFirst.mockResolvedValue({ id: 'landing1' });
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingConversion.create.mockResolvedValue({
      id: 'conv2',
      occurredAt: new Date('2026-09-21T00:01:00.000Z'),
    });

    const service = new MarketingConversionsService(prisma as never);

    await expect(
      service.recordConversion({
        type: 'LANDING_VIEW',
        anonymousId: '550e8400-e29b-41d4-a716-446655440000',
        landingSlug: 'autumn-games',
        idempotencyKey: 'k:2',
        props: { hello: 'world' },
      } as never),
    ).resolves.toMatchObject({ recorded: true, conversionId: 'conv2' });

    expect(prisma.marketingConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'LANDING_VIEW',
          idempotencyKey: 'k:2',
        }),
      }),
    );
  });

  it('does not inherit last-touch campaign for LANDING_VIEW without variant', async () => {
    const prisma = createPrisma();
    prisma.marketingConversion.findUnique.mockResolvedValue(null);
    prisma.marketingConversion.count.mockResolvedValue(0);
    prisma.marketingLanding.findFirst.mockResolvedValue({ id: 'landing1' });
    prisma.marketingAttributionTouch.findFirst
      .mockResolvedValueOnce({
        id: 'first',
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
        campaignId: 'camp1',
        variantId: 'var1',
        landingId: 'landing1',
      })
      .mockResolvedValueOnce({
        id: 'last',
        occurredAt: new Date('2026-09-20T00:00:00.000Z'),
        campaignId: 'camp1',
        variantId: 'var1',
        landingId: 'landing1',
      });
    prisma.marketingConversion.create.mockResolvedValue({
      id: 'conv3',
      occurredAt: new Date('2026-09-21T00:03:00.000Z'),
    });

    const service = new MarketingConversionsService(prisma as never);

    await service.recordConversion({
      type: 'LANDING_VIEW',
      anonymousId: '550e8400-e29b-41d4-a716-446655440000',
      landingSlug: 'autumn-games',
      idempotencyKey: 'k:3',
    } as never);

    expect(prisma.marketingConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: null,
          variantId: null,
          touchId: 'last',
        }),
      }),
    );
  });

  it('resolves attribution via anonymousId even when userId is set', async () => {
    const prisma = createPrisma();
    prisma.marketingConversion.findUnique.mockResolvedValue(null);
    prisma.marketingConversion.count.mockResolvedValue(0);
    prisma.marketingAttributionTouch.findFirst
      .mockResolvedValueOnce({
        id: 'first',
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
        campaignId: 'camp1',
        variantId: 'var1',
        landingId: 'landing1',
      })
      .mockResolvedValueOnce({
        id: 'last',
        occurredAt: new Date('2026-09-20T00:00:00.000Z'),
        campaignId: 'camp1',
        variantId: 'var1',
        landingId: 'landing1',
      });
    prisma.marketingConversion.create.mockResolvedValue({
      id: 'conv4',
      occurredAt: new Date('2026-09-21T00:04:00.000Z'),
    });

    const service = new MarketingConversionsService(prisma as never);

    await service.recordConversion({
      type: 'REGISTRATION_COMPLETED',
      userId: 'user1',
      anonymousId: '550e8400-e29b-41d4-a716-446655440000',
      idempotencyKey: 'register:user1',
    } as never);

    expect(prisma.marketingAttributionTouch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: 'user1' },
            { anonymousId: '550e8400-e29b-41d4-a716-446655440000' },
          ],
        }),
      }),
    );
    expect(prisma.marketingConversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'camp1',
          variantId: 'var1',
          touchId: 'last',
        }),
      }),
    );
  });
});
