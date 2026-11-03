import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Readable, Transform } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';

type Platform = 'win32' | 'linux';
type Release = { platform: Platform; version: string; file: string; key: string; sha512: string; size: number; createdAt: string };
type Policy = { current: string; minimum: string };
const PREFIX = 'desktop.release.';
const MAX_SIZE = 1024 * 1024 * 1024;
const PART_SIZE = 5 * 1024 * 1024;
type MultipartState = { platform: Platform; version: string; file: string; size: number; key: string; uploadId: string; parts: { PartNumber: number; ETag: string }[]; completed?: boolean };

export function compareVersions(a: string, b: string): number {
  const valid = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (a.length > 64 || b.length > 64 || !valid.test(a) || !valid.test(b)) throw new Error('Версия должна иметь формат X.Y.Z');
  const aa = a.split('.').map(BigInt), bb = b.split('.').map(BigInt);
  if ([...aa, ...bb].some((part) => part > BigInt(Number.MAX_SAFE_INTEGER))) throw new Error('Число в версии слишком велико');
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}

function platformOf(value: string): Platform {
  if (value !== 'win32' && value !== 'linux') throw new Error('Неизвестная платформа');
  return value;
}

function releaseName(platform: Platform, version: string): string {
  compareVersions(version, version);
  return platform === 'win32' ? `Adventura-Setup-${version}.exe` : `Adventura-${version}.AppImage`;
}

@Injectable()
export class DesktopUpdatesService {
  constructor(private readonly prisma: PrismaService, private readonly s3: S3Service) {}

  private releaseKey(platform: Platform, version: string) { return `${PREFIX}${platform}.${version}`; }
  private policyKey(platform: Platform) { return `desktop.policy.${platform}`; }

  async recordDownload(file: string, kind: string) {
    await this.prisma.analyticsEvent.create({ data: {
      name: 'desktop_installer_download', props: { file, kind },
    } });
  }

  async recordCompletedUpdate(id: string, from: string, to: string, platform: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Некорректный идентификатор');
    platformOf(platform);
    const direction = compareVersions(from, to);
    if (direction === 0) throw new Error('Версии совпадают');
    const key = `desktop.completed-update.${id}`;
    try {
      await this.prisma.$transaction([
        this.prisma.appSetting.create({ data: { key, value: to } }),
        this.prisma.analyticsEvent.create({ data: { name: 'desktop_update_completed', appVersion: to, props: { from, to, platform, kind: direction < 0 ? 'update' : 'rollback' } } }),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
  }

  async list() {
    const records = await this.prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
    const releases = records.map((record) => JSON.parse(record.value) as Release)
      .sort((a, b) => compareVersions(b.version, a.version));
    return { releases, policies: { win32: await this.getPolicy('win32'), linux: await this.getPolicy('linux') } };
  }

  async getPolicy(platform: Platform): Promise<Policy | null> {
    const record = await this.prisma.appSetting.findUnique({ where: { key: this.policyKey(platform) } });
    return record ? JSON.parse(record.value) as Policy : null;
  }

  async getRelease(platform: Platform, version: string): Promise<Release | null> {
    compareVersions(version, version);
    const record = await this.prisma.appSetting.findUnique({ where: { key: this.releaseKey(platform, version) } });
    return record ? JSON.parse(record.value) as Release : null;
  }

  async prepareUpload(platformValue: string, version: string, file: string) {
    const platform = platformOf(platformValue);
    if (file !== releaseName(platform, version)) throw new Error('Имя файла не соответствует платформе и версии');
    if (await this.getRelease(platform, version)) throw new Error('Эта версия уже загружена');
    const key = `desktop-updates/uploads/${platform}/${version}/${randomUUID()}`;
    return { key, url: await this.s3.getSignedNewObjectUploadUrl(key) };
  }

  private multipartKey(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Некорректный идентификатор загрузки');
    return `desktop.upload.${id}`;
  }

  private async multipartState(id: string): Promise<MultipartState> {
    const record = await this.prisma.appSetting.findUnique({ where: { key: this.multipartKey(id) } });
    if (!record) throw new Error('Загрузка не найдена');
    return JSON.parse(record.value) as MultipartState;
  }

  async startMultipart(platformValue: string, version: string, file: string, size: number) {
    const platform = platformOf(platformValue);
    if (file !== releaseName(platform, version)) throw new Error('Имя файла не соответствует платформе и версии');
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE) throw new Error('Недопустимый размер файла');
    if (await this.getRelease(platform, version)) throw new Error('Эта версия уже загружена');
    const id = randomUUID();
    const key = `desktop-updates/uploads/${platform}/${version}/${randomUUID()}`;
    const uploadId = await this.s3.beginMultipart(key);
    const state: MultipartState = { platform, version, file, size, key, uploadId, parts: [] };
    try { await this.prisma.appSetting.create({ data: { key: this.multipartKey(id), value: JSON.stringify(state) } }); }
    catch (error) { await this.s3.abortMultipart(key, uploadId).catch(() => undefined); throw error; }
    return { id, partSize: PART_SIZE };
  }

  async uploadPart(id: string, number: number, body: Readable, size: number) {
    const state = await this.multipartState(id);
    const count = Math.ceil(state.size / PART_SIZE);
    if (state.completed || !Number.isInteger(number) || number < 1 || number > count) throw new Error('Некорректный номер части');
    const expected = number === count ? state.size - PART_SIZE * (count - 1) : PART_SIZE;
    if (size !== expected) throw new Error('Некорректный размер части');
    if (number <= state.parts.length) { body.resume(); return; }
    if (number !== state.parts.length + 1) throw new Error('Части должны загружаться по порядку');
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of body) {
      received += chunk.length;
      if (received > expected) throw new Error('Часть файла слишком большая');
      chunks.push(Buffer.from(chunk));
    }
    if (received !== expected) throw new Error('Часть файла получена не полностью');
    const etag = await this.s3.uploadMultipartPart(state.key, state.uploadId, number, Buffer.concat(chunks));
    state.parts.push({ PartNumber: number, ETag: etag });
    await this.prisma.appSetting.update({ where: { key: this.multipartKey(id) }, data: { value: JSON.stringify(state) } });
  }

  async finishMultipart(id: string) {
    const state = await this.multipartState(id);
    const existing = await this.getRelease(state.platform, state.version);
    if (existing) return existing;
    if (state.parts.length !== Math.ceil(state.size / PART_SIZE)) throw new Error('Загружены не все части файла');
    if (!state.completed) {
      await this.s3.completeMultipart(state.key, state.uploadId, state.parts);
      state.completed = true;
      await this.prisma.appSetting.update({ where: { key: this.multipartKey(id) }, data: { value: JSON.stringify(state) } });
    }
    const release = await this.finishUpload(state.platform, state.version, state.file, state.key, state.size);
    await this.prisma.appSetting.delete({ where: { key: this.multipartKey(id) } }).catch(() => undefined);
    return release;
  }

  async abortMultipart(id: string) {
    const state = await this.multipartState(id);
    if (!state.completed) await this.s3.abortMultipart(state.key, state.uploadId);
    await this.prisma.appSetting.delete({ where: { key: this.multipartKey(id) } });
  }

  async uploadStream(platformValue: string, version: string, file: string, body: Readable, size: number) {
    const platform = platformOf(platformValue);
    if (file !== releaseName(platform, version)) throw new Error('Имя файла не соответствует платформе и версии');
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE) throw new Error('Недопустимый размер файла');
    if (await this.getRelease(platform, version)) throw new Error('Эта версия уже загружена');
    const key = `desktop-updates/uploads/${platform}/${version}/${randomUUID()}`;
    let received = 0;
    const limited = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > size) callback(new Error('Размер файла превышает заявленный'));
      else callback(null, chunk);
    } });
    body.on('error', (error) => limited.destroy(error));
    body.on('aborted', () => limited.destroy(new Error('Загрузка прервана')));
    body.pipe(limited);
    await this.s3.putNewObjectStream(key, limited, size);
    if (received !== size) throw new Error('Файл загружен не полностью');
    return this.finishUpload(platform, version, file, key);
  }

  async finishUpload(platformValue: string, version: string, file: string, key: string, expectedSize?: number) {
    const platform = platformOf(platformValue);
    const expectedPrefix = `desktop-updates/uploads/${platform}/${version}/`;
    if (file !== releaseName(platform, version) || !key.startsWith(expectedPrefix) || !/^[0-9a-f-]{36}$/.test(key.slice(expectedPrefix.length))) {
      throw new Error('Некорректные данные загрузки');
    }
    if (await this.getRelease(platform, version)) throw new Error('Эта версия уже загружена');
    const { sha512, size } = await this.s3.hashObject(key, MAX_SIZE);
    if (expectedSize !== undefined && size !== expectedSize) throw new Error('Размер загруженного файла не совпадает');
    const release: Release = { platform, version, file, key, sha512, size, createdAt: new Date().toISOString() };
    await this.prisma.appSetting.create({ data: { key: this.releaseKey(platform, version), value: JSON.stringify(release) } });
    return release;
  }

  async setPolicy(platformValue: string, current: string, minimum: string) {
    const platform = platformOf(platformValue);
    if (compareVersions(minimum, current) > 0) throw new Error('Минимальная версия не может быть выше текущей');
    if (!await this.getRelease(platform, current)) throw new Error('Текущий выпуск сначала нужно загрузить');
    const value = JSON.stringify({ current, minimum });
    await this.prisma.appSetting.upsert({ where: { key: this.policyKey(platform) }, create: { key: this.policyKey(platform), value }, update: { value } });
  }

  async currentManifest(platform: Platform): Promise<string | null> {
    const policy = await this.getPolicy(platform);
    if (!policy) return null;
    const release = await this.getRelease(platform, policy.current);
    if (!release) throw new NotFoundException('Текущий выпуск не найден');
    return `version: ${release.version}\nfiles:\n  - url: ${release.file}\n    sha512: ${release.sha512}\n    size: ${release.size}\npath: ${release.file}\nsha512: ${release.sha512}\nreleaseDate: '${release.createdAt}'\n`;
  }

  async artifactKey(file: string): Promise<string | null> {
    const match = /^Adventura-(Setup-)?(\d+\.\d+\.\d+)\.(exe|AppImage)$/.exec(file);
    if (!match) return null;
    const platform: Platform = match[1] && match[3] === 'exe' ? 'win32' : !match[1] && match[3] === 'AppImage' ? 'linux' : (() => { throw new NotFoundException(); })();
    return (await this.getRelease(platform, match[2]))?.key ?? null;
  }
}
