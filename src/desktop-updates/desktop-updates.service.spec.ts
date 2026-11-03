jest.mock('../storage/s3.service', () => ({ S3Service: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { DesktopUpdatesService, compareVersions } from './desktop-updates.service';
import { Readable } from 'stream';

describe('desktop release management', () => {
  const records = new Map<string, string>();
  const prisma = { appSetting: {
    findUnique: jest.fn(async ({ where }: any) => records.has(where.key) ? { value: records.get(where.key) } : null),
    findMany: jest.fn(async ({ where }: any) => [...records].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value }))),
    create: jest.fn(async ({ data }: any) => { if (records.has(data.key)) throw new Error('duplicate'); records.set(data.key, data.value); }),
    update: jest.fn(async ({ where, data }: any) => { records.set(where.key, data.value); }),
    delete: jest.fn(async ({ where }: any) => { records.delete(where.key); }),
    upsert: jest.fn(async ({ where, create, update }: any) => { records.set(where.key, records.has(where.key) ? update.value : create.value); }),
  } };
  const s3 = { getSignedNewObjectUploadUrl: jest.fn(async () => 'https://example.test/upload'), hashObject: jest.fn(async () => ({ size: 42, sha512: 'digest' })), putNewObjectStream: jest.fn(async (_key: string, body: Readable) => { for await (const _chunk of body) { /* consume */ } }), beginMultipart: jest.fn(async () => 'storage-id'), uploadMultipartPart: jest.fn(async () => 'etag'), completeMultipart: jest.fn(async () => undefined), abortMultipart: jest.fn(async () => undefined) };
  const service = new DesktopUpdatesService(prisma as any, s3 as any);
  beforeEach(() => { records.clear(); jest.clearAllMocks(); });

  it('orders numerical versions and rejects invalid input', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(() => compareVersions('1.0.0-beta', '1.0.0')).toThrow();
  });
  it('streams a valid installer to storage and registers it only after upload', async () => {
    await service.uploadStream('win32', '0.6.13', 'Adventura-Setup-0.6.13.exe', Readable.from([Buffer.from('test')]), 4);
    expect(s3.putNewObjectStream).toHaveBeenCalledTimes(1);
    expect(await service.getRelease('win32', '0.6.13')).not.toBeNull();
    await expect(service.uploadStream('win32', '0.6.14', 'wrong.exe', Readable.from([]), 1)).rejects.toThrow();
    await expect(service.uploadStream('win32', '0.6.14', 'Adventura-Setup-0.6.14.exe', Readable.from([]), 0)).rejects.toThrow();
    expect(await service.getRelease('win32', '0.6.14')).toBeNull();
  });
  it('uploads installer parts in order and validates the final object before registration', async () => {
    const size = 5 * 1024 * 1024 + 1;
    s3.hashObject.mockResolvedValueOnce({ size, sha512: 'digest' });
    const { id, partSize } = await service.startMultipart('win32', '0.6.13', 'Adventura-Setup-0.6.13.exe', size);
    await expect(service.uploadPart(id, 2, Readable.from([Buffer.from('x')]), 1)).rejects.toThrow();
    await service.uploadPart(id, 1, Readable.from([Buffer.alloc(partSize)]), partSize);
    await service.uploadPart(id, 1, Readable.from([]), partSize);
    await service.uploadPart(id, 2, Readable.from([Buffer.from('x')]), 1);
    expect(s3.uploadMultipartPart).toHaveBeenCalledTimes(2);
    await service.finishMultipart(id);
    expect(s3.completeMultipart).toHaveBeenCalledTimes(1);
    expect(await service.getRelease('win32', '0.6.13')).not.toBeNull();
  });
  it('records completion once and distinguishes updates from rollbacks', async () => {
    const settingCreate = jest.fn((_data: any) => ({}));
    const eventCreate = jest.fn((_data: any) => ({}));
    const transaction = jest.fn(async () => undefined);
    const tracked = new DesktopUpdatesService({ appSetting: { create: settingCreate }, analyticsEvent: { create: eventCreate }, $transaction: transaction } as any, s3 as any);
    const id = '55ea9204-2ac3-42ac-b7f2-6ba63bd4bc15';
    await tracked.recordCompletedUpdate(id, '0.6.12', '0.6.13', 'win32');
    expect(eventCreate.mock.calls[0][0]).toMatchObject({ data: { name: 'desktop_update_completed', props: { kind: 'update' } } });
    transaction.mockRejectedValueOnce({ code: 'P2002' } as never);
    await expect(tracked.recordCompletedUpdate(id, '0.6.12', '0.6.13', 'win32')).resolves.toBeUndefined();
    await tracked.recordCompletedUpdate(id, '0.6.13', '0.6.12', 'win32');
    expect(eventCreate.mock.calls[2][0]).toMatchObject({ data: { props: { kind: 'rollback' } } });
    await expect(tracked.recordCompletedUpdate('bad', '0.6.12', '0.6.13', 'win32')).rejects.toThrow();
  });
  it('stages releases, switches current version and rolls back without changing the artifacts', async () => {
    for (const version of ['1.0.0', '1.1.0']) {
      const file = `Adventura-Setup-${version}.exe`;
      const upload = await service.prepareUpload('win32', version, file);
      await service.finishUpload('win32', version, file, upload.key);
    }
    expect(await service.currentManifest('win32')).toBeNull();
    await service.setPolicy('win32', '1.1.0', '1.0.0');
    expect(await service.currentManifest('win32')).toContain('version: 1.1.0');
    await service.setPolicy('win32', '1.0.0', '1.0.0');
    expect(await service.currentManifest('win32')).toContain('version: 1.0.0');
    expect((await service.list()).releases).toHaveLength(2);
    await expect(service.setPolicy('win32', '1.0.0', '1.1.0')).rejects.toThrow();
    await expect(service.prepareUpload('win32', '1.0.0', 'Adventura-Setup-1.0.0.exe')).rejects.toThrow();
  });
});
