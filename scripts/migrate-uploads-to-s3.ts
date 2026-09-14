import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(__dirname, '..');
const DEFAULT_DUMP = join(ROOT, 'dumps', 'railway_adventura_20260914_161638.sql');
const DEFAULT_STAGING = join(ROOT, 'dumps', 'uploads-from-railway');
const MISSING_LOG = join(ROOT, 'dumps', 's3-migrate-missing.txt');

const MIME_BY_EXT: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

/** Parse Media.path keys from a pg_dump COPY block. */
function parseMediaPathsFromDump(dumpPath: string): string[] {
  const text = readFileSync(dumpPath, 'utf8');
  const lines = text.split('\n');
  const keys: string[] = [];
  let inMedia = false;

  for (const line of lines) {
    if (line.startsWith('COPY public."Media"')) {
      inMedia = true;
      continue;
    }
    if (!inMedia) continue;
    if (line === '\\.') {
      break;
    }
    // id entityType entityId collection variant mimeType path width height size createdAt
    const cols = line.split('\t');
    if (cols.length < 7) continue;
    const path = cols[6]?.trim();
    if (path) keys.push(path);
  }

  return [...new Set(keys)].sort();
}

function walkFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'lost+found' || name === '.DS_Store') continue;
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      out.push(...walkFiles(abs, rel));
    } else {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

async function main() {
  loadEnvFile(join(ROOT, '.env'));

  const dumpPath = process.argv[2] ?? DEFAULT_DUMP;
  const stagingDir = process.argv[3] ?? DEFAULT_STAGING;

  if (!existsSync(dumpPath)) {
    throw new Error(`Dump not found: ${dumpPath}`);
  }
  if (!existsSync(stagingDir)) {
    throw new Error(`Staging dir not found: ${stagingDir}`);
  }

  const endpoint = process.env.S3_ENDPOINT ?? 'https://storage.yandexcloud.net';
  const region = process.env.S3_REGION ?? 'ru-central1';
  const bucket = requireEnv('S3_BUCKET');
  const accessKeyId = requireEnv('S3_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY');

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const dumpKeys = parseMediaPathsFromDump(dumpPath);
  const stagingFiles = new Set(walkFiles(stagingDir));

  console.log(
    `dump keys=${dumpKeys.length}, staging files=${stagingFiles.size}, bucket=${bucket}`,
  );

  let uploaded = 0;
  let missing = 0;
  let errors = 0;
  const missingKeys: string[] = [];

  for (const key of dumpKeys) {
    const localPath = join(stagingDir, key);
    if (!existsSync(localPath)) {
      missing += 1;
      missingKeys.push(key);
      console.log(`MISSING ${key}`);
      continue;
    }

    const body = readFileSync(localPath);
    const contentType =
      MIME_BY_EXT[extname(key).toLowerCase()] ?? 'application/octet-stream';

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      uploaded += 1;
      console.log(`OK ${key} (${body.length} bytes)`);
    } catch (err) {
      errors += 1;
      console.error(`FAIL ${key}:`, err instanceof Error ? err.message : err);
    }
  }

  const orphanStaging = [...stagingFiles].filter((f) => !dumpKeys.includes(f));
  if (orphanStaging.length > 0) {
    console.log(`\nStaging orphans (not in dump Media): ${orphanStaging.length}`);
    for (const f of orphanStaging.slice(0, 20)) {
      console.log(`  orphan ${f}`);
    }
  }

  createWriteStream(MISSING_LOG).end(
    missingKeys.length ? `${missingKeys.join('\n')}\n` : '',
  );

  console.log('\n=== summary ===');
  console.log({ uploaded, missing, errors, dumpKeys: dumpKeys.length });
  console.log(`missing log → ${MISSING_LOG}`);

  // Spot-check: head + signed URL for first uploaded key that exists
  const sample = dumpKeys.find((k) => existsSync(join(stagingDir, k)));
  if (sample && errors === 0) {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: sample }),
    );
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: sample }),
      { expiresIn: 600 },
    );
    console.log(`sample head OK: ${sample}`);
    console.log(`sample signed URL (10m): ${url.slice(0, 120)}...`);
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
