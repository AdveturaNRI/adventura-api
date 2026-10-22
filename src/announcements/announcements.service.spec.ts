/* eslint-disable @typescript-eslint/require-await */
import { SiteAnnouncementStatus } from '@prisma/client';

jest.mock('../media/media.service', () => ({
  MediaService: class MediaService {},
}));
jest.mock('../image/image-processor.service', () => ({
  ImageProcessorService: class ImageProcessorService {},
}));
jest.mock('../realtime/realtime.emitter', () => ({
  RealtimeEmitter: class RealtimeEmitter {},
}));
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AnnouncementsService } from './announcements.service';

function makeService(overrides?: {
  announcements?: Map<string, Record<string, unknown>>;
  dismissals?: Array<Record<string, unknown>>;
}) {
  const store =
    overrides?.announcements ?? new Map<string, Record<string, unknown>>();
  const dismissals = overrides?.dismissals ?? [];
  const emitted: unknown[] = [];

  const prisma = {
    siteAnnouncement: {
      findMany: jest.fn(
        async ({ where }: { where?: Record<string, unknown> }) => {
          const all = [...store.values()];
          if (!where) return all;
          return all.filter((row) => {
            if (where.status && row.status !== where.status) return false;
            return true;
          });
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return store.get(where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'ann-1',
          publicationVersion: 0,
          publishedAt: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          status: SiteAnnouncementStatus.DRAFT,
          body: '',
          actionLabel: null,
          actionUrl: null,
          theme: {},
          ...data,
        };
        store.set(row.id, row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const current = store.get(where.id);
          if (!current) throw new Error('missing');
          const next = {
            ...current,
            ...data,
            updatedAt: new Date('2026-01-02'),
          };
          store.set(where.id, next);
          return next;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        store.delete(where.id);
      }),
    },
    siteAnnouncementDismissal: {
      findMany: jest.fn(async ({ where }: { where?: { userId?: string } }) => {
        if (where?.userId) {
          return dismissals.filter((d) => d.userId === where.userId);
        }
        return dismissals;
      }),
      upsert: jest.fn(
        async ({ create }: { create: Record<string, unknown> }) => {
          dismissals.push(create);
          return create;
        },
      ),
    },
  };

  const media = {
    getCollection: jest.fn(async () => []),
    getCollectionUrls: jest.fn(async () => ({})),
    replaceCollection: jest.fn(),
    deleteCollection: jest.fn(),
    deleteEntityMedia: jest.fn(),
  };

  const images = {
    processImage: jest.fn(),
  };

  const realtime = {
    emitAnnouncementPublished: jest.fn((payload: unknown) => {
      emitted.push(payload);
    }),
  };

  const service = new AnnouncementsService(
    prisma as never,
    media as never,
    images,
    realtime as never,
  );

  return { service, store, dismissals, emitted, prisma, realtime };
}

describe('AnnouncementsService', () => {
  it('draft is not listed as pending', async () => {
    const { service, store } = makeService();
    store.set('a1', {
      id: 'a1',
      internalName: 'x',
      title: 'Hello',
      body: 'Body',
      actionLabel: null,
      actionUrl: null,
      status: SiteAnnouncementStatus.DRAFT,
      publicationVersion: 0,
      publishedAt: null,
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pending = await service.listPendingForUser('user-1');
    expect(pending).toEqual([]);
  });

  it('publish makes announcement pending; dismiss hides it for that user', async () => {
    const { service, store, dismissals, emitted } = makeService();
    store.set('a1', {
      id: 'a1',
      internalName: 'x',
      title: 'Hello',
      body: 'Body',
      actionLabel: null,
      actionUrl: null,
      status: SiteAnnouncementStatus.DRAFT,
      publicationVersion: 0,
      publishedAt: null,
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.publish('a1');
    expect(emitted).toEqual([{ id: 'a1', publicationVersion: 1 }]);
    expect(store.get('a1')?.status).toBe(SiteAnnouncementStatus.PUBLISHED);

    let pending = await service.listPendingForUser('user-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.title).toBe('Hello');

    await service.dismissForUser('user-1', 'a1', 1);
    expect(dismissals).toHaveLength(1);

    pending = await service.listPendingForUser('user-1');
    expect(pending).toHaveLength(0);

    const pendingOther = await service.listPendingForUser('user-2');
    expect(pendingOther).toHaveLength(1);
  });

  it('edit does not bump version; republish does', async () => {
    const { service, store, emitted } = makeService();
    store.set('a1', {
      id: 'a1',
      internalName: 'x',
      title: 'Hello',
      body: 'Body',
      actionLabel: null,
      actionUrl: null,
      status: SiteAnnouncementStatus.PUBLISHED,
      publicationVersion: 1,
      publishedAt: new Date('2026-01-01'),
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.update('a1', { title: 'Edited' });
    expect(store.get('a1')?.publicationVersion).toBe(1);
    expect(store.get('a1')?.title).toBe('Edited');
    expect(emitted).toHaveLength(0);

    await service.publish('a1', { republish: true });
    expect(store.get('a1')?.publicationVersion).toBe(2);
    expect(emitted).toEqual([{ id: 'a1', publicationVersion: 2 }]);
  });

  it('archived announcements are not pending', async () => {
    const { service, store } = makeService();
    store.set('a1', {
      id: 'a1',
      internalName: 'x',
      title: 'Hello',
      body: 'Body',
      actionLabel: null,
      actionUrl: null,
      status: SiteAnnouncementStatus.ARCHIVED,
      publicationVersion: 1,
      publishedAt: new Date(),
      theme: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const pending = await service.listPendingForUser('user-1');
    expect(pending).toEqual([]);
  });
});
