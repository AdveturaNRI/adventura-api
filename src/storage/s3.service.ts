import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;
  private readonly signedUrlExpiresSec: number;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>(
      'S3_ENDPOINT',
      'https://storage.yandexcloud.net',
    );
    // The API may reach an S3 service via an address unavailable to browsers
    // (for example, `minio:9000` in Docker). Signed links must use a browser
    // reachable host, without changing where uploads and deletes are sent.
    const publicEndpoint =
      configService.get<string>('S3_PUBLIC_ENDPOINT')?.trim() || endpoint;
    const region = configService.get<string>('S3_REGION', 'ru-central1');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID', '');
    const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY', '');
    const forcePathStyle =
      configService.get<string>('S3_FORCE_PATH_STYLE', 'false').toLowerCase() ===
      'true';
    this.bucket = configService.get<string>('S3_BUCKET', '');
    this.signedUrlExpiresSec = Number(
      configService.get<string>('S3_SIGNED_URL_EXPIRES_SEC', '3600'),
    );

    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 is not configured: set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      );
    }

    const clientOptions = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // MinIO normally uses path-style URLs: http://host:9000/bucket/key.
      // Leave this disabled for Yandex Object Storage in production.
      forcePathStyle,
      // Yandex Object Storage rejects AWS SDK v3 default flexible checksums.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    } as const;

    this.client = new S3Client({ ...clientOptions, endpoint });
    this.publicClient = new S3Client({ ...clientOptions, endpoint: publicEndpoint });
  }

  onModuleInit() {
    this.logger.log(
      `S3 ready → bucket=${this.bucket}, signedUrl=${this.signedUrlExpiresSec}s`,
    );
  }

  async getSignedObjectUrl(key: string, expiresInSec?: number): Promise<string> {
    const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/');
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
      }),
      {
        expiresIn: expiresInSec ?? this.signedUrlExpiresSec,
      },
    );
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/');
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
      }),
    );
    const body = result.Body;
    if (!body) {
      throw new Error(`S3 object empty: ${normalized}`);
    }
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const key = params.key.replace(/\\/g, '/');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const normalized = key.replace(/\\/g, '/');
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
      }),
    );
  }

  async deleteObjects(keys: string[]): Promise<void> {
    const unique = [
      ...new Set(keys.map((key) => key.replace(/\\/g, '/')).filter(Boolean)),
    ];
    if (unique.length === 0) {
      return;
    }

    for (let i = 0; i < unique.length; i += 1000) {
      const chunk = unique.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
  }
}
