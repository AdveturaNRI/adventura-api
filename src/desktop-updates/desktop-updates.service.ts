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

  async finishUpload(platformValue: string, version: string, file: string, key: string) {
    const platform = platformOf(platformValue);
    const expectedPrefix = `desktop-updates/uploads/${platform}/${version}/`;
    if (file !== releaseName(platform, version) || !key.startsWith(expectedPrefix) || !/^[0-9a-f-]{36}$/.test(key.slice(expectedPrefix.length))) {
      throw new Error('Некорректные данные загрузки');
    }
    if (await this.getRelease(platform, version)) throw new Error('Эта версия уже загружена');
    const { sha512, size } = await this.s3.hashObject(key, MAX_SIZE);
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
