// Run from the API repository after building one platform; publish the manifest last.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || !['latest.yml', 'latest-linux.yml'].includes(path.basename(manifestPath))) {
    throw new Error('Usage: node scripts/publish-desktop-release.cjs <path/to/latest.yml or latest-linux.yml>');
  }
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const version = /^version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)['"]?\s*$/m.exec(manifest)?.[1];
  const artifact = /^path:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(manifest)?.[1];
  const expected = /^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?\s*$/m.exec(manifest)?.[1];
  const name = path.basename(manifestPath);
  const suffix = name === 'latest.yml' ? `Setup-${version}.exe` : `${version}.AppImage`;
  if (!version || artifact !== `Adventura-${suffix}` || !expected) throw new Error('Invalid manifest or artifact name');
  const artifactPath = path.join(path.dirname(manifestPath), artifact);
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(artifactPath)) hash.update(chunk);
  if (hash.digest('base64') !== expected) throw new Error('Artifact SHA-512 does not match manifest');
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('S3 credentials and bucket are required');
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
    region: process.env.S3_REGION || 'ru-central1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const put = (key, body, contentType, extra = {}) => client.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: `desktop-updates/${key}`, Body: body, ContentType: contentType, ...extra,
  }));
  await put(artifact, fs.createReadStream(artifactPath), 'application/octet-stream', {
    ContentLength: fs.statSync(artifactPath).size, IfNoneMatch: '*',
  });
  await put(`versions/${version}/${name}`, manifest, 'text/yaml', { IfNoneMatch: '*' });
  await put(name, manifest, 'text/yaml', { CacheControl: 'no-store' });
  console.log(`Published ${name} version ${version}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
