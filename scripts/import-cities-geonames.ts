import { execSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { get as httpsGet } from 'node:https';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GEONAMES_BASE_URL = 'https://download.geonames.org/export/dump';
const DATA_DIR = join(__dirname, '..', 'prisma', 'data', 'geonames');
const ADMIN1_NAMES_PATH = join(__dirname, '..', 'prisma', 'data', 'admin1-ru-by.json');
const BLOCKED_NAMES_PATH = join(__dirname, '..', 'prisma', 'data', 'blocked-city-names.json');
const CANONICAL_OVERRIDES_PATH = join(__dirname, '..', 'prisma', 'data', 'canonical-city-overrides.json');
const MIN_POPULATION = 5_000;
const SUPPORTED_COUNTRIES = new Map([
  ['RU', 'clcountry01'],
  ['BY', 'clcountry02'],
]);

type GeoRecord = {
  geonameId: number;
  name: string;
  alternatenames: string;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1: string;
  population: number;
};

type NormalizedCity = {
  geonameId: number;
  countryId: string;
  countryCode: string;
  name: string;
  region: string | null;
  population: number;
};

type Admin1Names = Record<string, Record<string, string>>;
type RussianAlternateNames = Map<number, string>;

function loadJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadAdmin1Names(): Admin1Names {
  return loadJsonFile<Admin1Names>(ADMIN1_NAMES_PATH);
}

function loadBlockedNames(): Set<string> {
  return new Set(loadJsonFile<string[]>(BLOCKED_NAMES_PATH));
}

function loadCanonicalOverrides(): Record<string, string> {
  return loadJsonFile<Record<string, string>>(CANONICAL_OVERRIDES_PATH);
}

function isRussianCityName(value: string, blockedNames: Set<string>): boolean {
  const trimmed = value.trim();

  if (!trimmed || !/^[А-ЯЁ][А-Яа-яёЁ0-9\s\-–—'().]*$/.test(trimmed)) {
    return false;
  }

  if (/[ӑӓӘәӜӝӞӟӤӥӦӧӨөӪӫӬӭӮӯӰӱӲӳӴӵӶӷӸӹӺӻӼӽӾӿ]/.test(trimmed)) {
    return false;
  }

  return !blockedNames.has(trimmed);
}

async function ensureAlternateNamesFile(): Promise<string> {
  const zipPath = join(DATA_DIR, 'alternateNames.zip');
  const txtPath = join(DATA_DIR, 'alternateNames.txt');

  if (!existsSync(txtPath)) {
    if (!existsSync(zipPath)) {
      console.log('Downloading alternateNames.zip...');
      await downloadFile(`${GEONAMES_BASE_URL}/alternateNames.zip`, zipPath);
    }

    console.log('Extracting alternateNames.zip...');
    await unzipFile(zipPath, DATA_DIR);
  }

  return txtPath;
}

async function loadRussianAlternateNames(
  targetIds: Set<number>,
  blockedNames: Set<string>,
): Promise<RussianAlternateNames> {
  const txtPath = await ensureAlternateNamesFile();
  const preferred = new Map<number, string>();
  const fallback = new Map<number, string>();
  const stream = createReadStream(txtPath, { encoding: 'utf8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    const parts = line.split('\t');

    if (parts.length < 8) {
      continue;
    }

    const geonameId = Number.parseInt(parts[1], 10);
    const lang = parts[2];
    const name = parts[3]?.trim();
    const isPreferred = parts[4] === '1';
    const isHistoric = parts[7] === '1';

    if (!targetIds.has(geonameId) || lang !== 'ru' || !name || isHistoric) {
      continue;
    }

    if (!isRussianCityName(name, blockedNames)) {
      continue;
    }

    if (isPreferred) {
      preferred.set(geonameId, name);
      continue;
    }

    if (!fallback.has(geonameId) && !preferred.has(geonameId)) {
      fallback.set(geonameId, name);
    }
  }

  const result = new Map<number, string>();

  for (const geonameId of targetIds) {
    const name = preferred.get(geonameId) ?? fallback.get(geonameId);

    if (name) {
      result.set(geonameId, name);
    }
  }

  return result;
}

function resolveRegion(countryCode: string, admin1: string, admin1Names: Admin1Names): string | null {
  if (!admin1) {
    return null;
  }

  return admin1Names[countryCode]?.[admin1] ?? null;
}

function pickDisplayName(
  record: GeoRecord,
  russianAlternateNames: RussianAlternateNames,
  canonicalOverrides: Record<string, string>,
  blockedNames: Set<string>,
): string | null {
  const canonical = canonicalOverrides[String(record.geonameId)];

  if (canonical) {
    return canonical;
  }

  const preferredRussian = russianAlternateNames.get(record.geonameId);

  if (preferredRussian && isRussianCityName(preferredRussian, blockedNames)) {
    return preferredRussian;
  }

  return null;
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);

    httpsGet(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function unzipFile(zipPath: string, destinationDir: string) {
  execSync(`unzip -o -q "${zipPath}" -d "${destinationDir}"`, { stdio: 'inherit' });
}

function parseGeoLine(line: string): GeoRecord | null {
  const parts = line.split('\t');

  if (parts.length < 15) {
    return null;
  }

  return {
    geonameId: Number.parseInt(parts[0], 10),
    name: parts[1],
    alternatenames: parts[3],
    featureClass: parts[6],
    featureCode: parts[7],
    countryCode: parts[8],
    admin1: parts[10],
    population: Number.parseInt(parts[14], 10) || 0,
  };
}

async function readGeoFile(filePath: string, countryCode: string): Promise<GeoRecord[]> {
  const records: GeoRecord[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    const record = parseGeoLine(line);

    if (
      !record ||
      record.countryCode !== countryCode ||
      record.featureClass !== 'P' ||
      !record.featureCode.startsWith('PPL') ||
      record.population < MIN_POPULATION
    ) {
      continue;
    }

    records.push(record);
  }

  return records;
}

function buildCityId(geonameId: number): string {
  return `clgeo${geonameId}`;
}

function normalizeRecord(
  record: GeoRecord,
  countryId: string,
  admin1Names: Admin1Names,
  russianAlternateNames: RussianAlternateNames,
  canonicalOverrides: Record<string, string>,
  blockedNames: Set<string>,
): NormalizedCity | null {
  const name = pickDisplayName(record, russianAlternateNames, canonicalOverrides, blockedNames);

  if (!name) {
    return null;
  }

  return {
    geonameId: record.geonameId,
    countryId,
    countryCode: record.countryCode,
    name,
    region: resolveRegion(record.countryCode, record.admin1, admin1Names),
    population: record.population,
  };
}

function buildUniqueKey(city: Pick<NormalizedCity, 'countryId' | 'name' | 'region'>): string {
  return `${city.countryId}|${city.name}|${city.region ?? ''}`;
}

function dedupeCities(cities: NormalizedCity[]): NormalizedCity[] {
  const byUniqueKey = new Map<string, NormalizedCity>();

  for (const city of cities) {
    const key = buildUniqueKey(city);
    const existing = byUniqueKey.get(key);

    if (!existing || city.population > existing.population) {
      byUniqueKey.set(key, city);
    }
  }

  return [...byUniqueKey.values()];
}

async function upsertCity(city: NormalizedCity) {
  const cityId = buildCityId(city.geonameId);
  const cityData = {
    name: city.name,
    region: city.region,
    population: city.population,
    geonameId: city.geonameId,
    isActive: true,
  };

  const [existingByGeo, existingByKey, existingById] = await Promise.all([
    prisma.city.findUnique({
      where: { geonameId: city.geonameId },
      select: { id: true },
    }),
    prisma.city.findFirst({
      where: {
        countryId: city.countryId,
        name: city.name,
        region: city.region,
      },
      select: { id: true },
    }),
    prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    }),
  ]);

  if (existingByGeo && existingByKey && existingByGeo.id !== existingByKey.id) {
    await prisma.city.update({
      where: { id: existingByGeo.id },
      data: {
        geonameId: null,
        isActive: false,
      },
    });
  }

  const targetId = existingByKey?.id ?? existingByGeo?.id ?? existingById?.id;

  if (targetId) {
    await prisma.city.update({
      where: { id: targetId },
      data: cityData,
    });
    return;
  }

  await prisma.city.create({
    data: {
      id: cityId,
      countryId: city.countryId,
      ...cityData,
    },
  });
}

async function ensureCountries() {
  await prisma.country.createMany({
    data: [
      { id: 'clcountry01', code: 'RU', name: 'Россия', sortOrder: 1 },
      { id: 'clcountry02', code: 'BY', name: 'Беларусь', sortOrder: 2 },
    ],
    skipDuplicates: true,
  });
}

async function deactivateBlockedCities(blockedNames: Set<string>) {
  await prisma.city.updateMany({
    where: {
      name: {
        in: [...blockedNames],
      },
    },
    data: {
      isActive: false,
    },
  });
}

async function prepareCountryFile(countryCode: string) {
  const zipPath = join(DATA_DIR, `${countryCode}.zip`);
  const txtPath = join(DATA_DIR, `${countryCode}.txt`);

  if (!existsSync(zipPath)) {
    console.log(`Downloading ${countryCode}.zip...`);
    await downloadFile(`${GEONAMES_BASE_URL}/${countryCode}.zip`, zipPath);
  }

  if (!existsSync(txtPath)) {
    console.log(`Extracting ${countryCode}.zip...`);
    await unzipFile(zipPath, DATA_DIR);
  }

  return txtPath;
}

async function importCountry(
  countryCode: string,
  admin1Names: Admin1Names,
  russianAlternateNames: RussianAlternateNames,
  canonicalOverrides: Record<string, string>,
  blockedNames: Set<string>,
) {
  const countryId = SUPPORTED_COUNTRIES.get(countryCode);

  if (!countryId) {
    throw new Error(`Unsupported country code: ${countryCode}`);
  }

  const txtPath = await prepareCountryFile(countryCode);

  const records = dedupeCities(
    (await readGeoFile(txtPath, countryCode))
      .map((record) =>
        normalizeRecord(
          record,
          countryId,
          admin1Names,
          russianAlternateNames,
          canonicalOverrides,
          blockedNames,
        ),
      )
      .filter((record): record is NormalizedCity => record !== null),
  );
  console.log(`Prepared ${records.length} unique cities for ${countryCode}`);

  const batchSize = 100;

  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);

    for (const city of batch) {
      await upsertCity(city);
    }

    console.log(`Imported ${Math.min(index + batchSize, records.length)} / ${records.length} for ${countryCode}`);
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const admin1Names = loadAdmin1Names();
  const blockedNames = loadBlockedNames();
  const canonicalOverrides = loadCanonicalOverrides();
  await ensureCountries();

  const targetIds = new Set<number>();

  for (const countryCode of SUPPORTED_COUNTRIES.keys()) {
    const txtPath = await prepareCountryFile(countryCode);
    const records = await readGeoFile(txtPath, countryCode);

    for (const record of records) {
      targetIds.add(record.geonameId);
    }
  }

  console.log(`Loading Russian alternate names for ${targetIds.size} cities...`);
  const russianAlternateNames = await loadRussianAlternateNames(targetIds, blockedNames);
  console.log(`Resolved ${russianAlternateNames.size} Russian city names`);

  for (const countryCode of SUPPORTED_COUNTRIES.keys()) {
    await importCountry(
      countryCode,
      admin1Names,
      russianAlternateNames,
      canonicalOverrides,
      blockedNames,
    );
  }

  await deactivateBlockedCities(blockedNames);

  console.log('City import completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
