import {
  MarketingCampaignStatus,
  MarketingLandingStatus,
} from '@prisma/client';

import { MarketingAttributionService } from './marketing-attribution.service';

const anonymousId = '550e8400-e29b-41d4-a716-446655440000';
const variant = {
  id: 'variant123',
  campaignId: 'campaign123',
  landingId: 'landing123',
  campaign: { status: MarketingCampaignStatus.ACTIVE },
  landing: { slug: 'autumn-games', status: MarketingLandingStatus.PUBLISHED },
  utmSource: 'yandex',
  utmMedium: 'cpc',
  utmCampaign: 'autumn',
  utmContent: null,
  utmTerm: null,
  utmId: null,
};

describe('MarketingAttributionService', () => {
  const createPrisma = () => ({
    marketingCampaignVariant: { findFirst: jest.fn() },
    marketingLanding: { findFirst: jest.fn() },
    marketingAttributionTouch: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  });

  it('stores a touch linked to the configured campaign and variant', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findFirst.mockResolvedValue(variant);
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingAttributionTouch.count.mockResolvedValue(0);
    prisma.marketingAttributionTouch.create.mockResolvedValue({
      id: 'touch123',
      occurredAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const service = new MarketingAttributionService(prisma as never);

    const result = await service.recordTouch({
      anonymousId,
      variantId: variant.id,
      landingSlug: 'autumn-games',
      utmSource: 'yandex',
      utmMedium: 'cpc',
      yclid: 'abc_123',
      referrer: 'https://yandex.ru/search/?text=adventura',
    });

    expect(result).toMatchObject({ recorded: true, touchId: 'touch123' });
    expect(prisma.marketingAttributionTouch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anonymousId,
          campaignId: 'campaign123',
          variantId: 'variant123',
          landingId: 'landing123',
          referrer: 'https://yandex.ru',
        }),
      }),
    );
  });

  it('does not create the same touch twice inside the deduplication window', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findFirst.mockResolvedValue(variant);
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue({
      id: 'old-touch',
    });
    const service = new MarketingAttributionService(prisma as never);

    await expect(
      service.recordTouch({ anonymousId, variantId: variant.id }),
    ).resolves.toEqual({
      recorded: false,
      reason: 'duplicate',
      touchId: 'old-touch',
    });
    expect(prisma.marketingAttributionTouch.create).not.toHaveBeenCalled();
  });

  it('ignores a campaign variant used with another landing (still records organic touch)', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findFirst.mockResolvedValue(variant);
    prisma.marketingLanding.findFirst.mockResolvedValue({
      id: 'landing-other',
    });
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingAttributionTouch.count.mockResolvedValue(0);
    prisma.marketingAttributionTouch.create.mockResolvedValue({
      id: 'touch-organic',
      occurredAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const service = new MarketingAttributionService(prisma as never);

    await expect(
      service.recordTouch({
        anonymousId,
        variantId: variant.id,
        landingSlug: 'another-landing',
      }),
    ).resolves.toMatchObject({ recorded: true, touchId: 'touch-organic' });
    expect(prisma.marketingAttributionTouch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: null,
          variantId: null,
          landingId: 'landing-other',
        }),
      }),
    );
  });

  it('attributes touches for DRAFT campaigns (links work before ACTIVE)', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findFirst.mockResolvedValue({
      ...variant,
      campaign: { status: MarketingCampaignStatus.DRAFT },
    });
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingAttributionTouch.count.mockResolvedValue(0);
    prisma.marketingAttributionTouch.create.mockResolvedValue({
      id: 'touch-draft',
      occurredAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const service = new MarketingAttributionService(prisma as never);

    await expect(
      service.recordTouch({
        anonymousId,
        variantId: variant.id,
        landingSlug: 'autumn-games',
      }),
    ).resolves.toMatchObject({ recorded: true, touchId: 'touch-draft' });
    expect(prisma.marketingAttributionTouch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'campaign123',
          variantId: 'variant123',
        }),
      }),
    );
  });

  it('binds only unclaimed recent anonymous touches to the authenticated user', async () => {
    const prisma = createPrisma();
    prisma.marketingAttributionTouch.updateMany.mockResolvedValue({ count: 3 });
    const service = new MarketingAttributionService(prisma as never);

    await expect(
      service.bindAnonymousTouches('user123', anonymousId),
    ).resolves.toEqual({ bound: 3 });
    expect(prisma.marketingAttributionTouch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ anonymousId, userId: null }),
        data: { userId: 'user123' },
      }),
    );
  });

  it('resolves landingId from slug when no variant is provided', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findFirst.mockResolvedValue(null);
    prisma.marketingLanding.findFirst.mockResolvedValue({
      id: 'landing-organic',
    });
    prisma.marketingAttributionTouch.findFirst.mockResolvedValue(null);
    prisma.marketingAttributionTouch.count.mockResolvedValue(0);
    prisma.marketingAttributionTouch.create.mockResolvedValue({
      id: 'touch-organic',
      occurredAt: new Date('2026-09-20T12:00:00.000Z'),
    });
    const service = new MarketingAttributionService(prisma as never);

    await service.recordTouch({
      anonymousId,
      landingSlug: 'autumn-games',
      utmSource: 'newsletter',
    });

    expect(prisma.marketingLanding.findFirst).toHaveBeenCalled();
    expect(prisma.marketingAttributionTouch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          landingId: 'landing-organic',
          campaignId: null,
          variantId: null,
        }),
      }),
    );
  });

  it('returns the earliest and latest immutable touches for first/last attribution', async () => {
    const prisma = createPrisma();
    prisma.marketingAttributionTouch.findFirst
      .mockResolvedValueOnce({ id: 'first' })
      .mockResolvedValueOnce({ id: 'last' });
    const service = new MarketingAttributionService(prisma as never);

    await expect(service.getUserAttribution('user123')).resolves.toEqual({
      firstTouch: { id: 'first' },
      lastTouch: { id: 'last' },
    });
    expect(prisma.marketingAttributionTouch.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.marketingAttributionTouch.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});
