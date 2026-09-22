jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MarketingCampaignsService } = require('./marketing-campaigns.service');

describe('MarketingCampaignsService', () => {
  const createPrisma = () => ({
    marketingCampaignVariant: { findUnique: jest.fn() },
    marketingCampaign: { findUnique: jest.fn(), create: jest.fn() },
    marketingLanding: { findUnique: jest.fn() },
  });

  const createConfig = (origin: string) => ({
    get: jest.fn((key: string) => (key === 'WEB_PUBLIC_URL' ? origin : undefined)),
  });

  it('encodes a deterministic variant URL with UTM params', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findUnique.mockResolvedValue({
      id: 'variant123',
      isActive: true,
      utmSource: 'yandex',
      utmMedium: 'cpc',
      utmCampaign: 'autumn-2026',
      utmContent: 'hello world',
      utmTerm: 'dice+dnd',
      utmId: 'id-1',
      landing: { slug: 'autumn-games', status: 'PUBLISHED' },
    });
    const service = new MarketingCampaignsService(prisma as never, createConfig('https://adventura.app') as never);

    const result = await service.getVariantUrl('variant123', 'https://adventura.app/');
    const url = new URL(result.url);

    expect(url.origin).toBe('https://adventura.app');
    expect(url.pathname).toBe('/l/autumn-games');
    expect(url.searchParams.get('utm_source')).toBe('yandex');
    expect(url.searchParams.get('utm_medium')).toBe('cpc');
    expect(url.searchParams.get('utm_campaign')).toBe('autumn-2026');
    expect(url.searchParams.get('utm_content')).toBe('hello world');
    expect(url.searchParams.get('utm_term')).toBe('dice+dnd');
    expect(url.searchParams.get('utm_id')).toBe('id-1');
    expect(url.searchParams.get('adv_variant')).toBe('variant123');
  });

  it('allows http://localhost for local QR generation', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findUnique.mockResolvedValue({
      id: 'variant123',
      isActive: true,
      utmSource: 'yandex',
      utmMedium: 'cpc',
      utmCampaign: 'local',
      utmContent: null,
      utmTerm: null,
      utmId: null,
      landing: { slug: 'autumn-games', status: 'PUBLISHED' },
    });
    const service = new MarketingCampaignsService(
      prisma as never,
      createConfig('http://localhost:8081') as never,
    );

    const result = await service.getVariantUrl('variant123', 'http://localhost:8081');
    expect(result.url.startsWith('http://localhost:8081/l/autumn-games?')).toBe(true);
  });

  it('rejects http origins that are not local', async () => {
    const prisma = createPrisma();
    prisma.marketingCampaignVariant.findUnique.mockResolvedValue({
      id: 'variant123',
      isActive: true,
      utmSource: 'yandex',
      utmMedium: 'cpc',
      utmCampaign: 'prod',
      utmContent: null,
      utmTerm: null,
      utmId: null,
      landing: { slug: 'autumn-games', status: 'PUBLISHED' },
    });
    const service = new MarketingCampaignsService(
      prisma as never,
      createConfig('http://adventu.ru') as never,
    );

    await expect(
      service.getVariantUrl('variant123', 'http://adventu.ru'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

