import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { MAX_UPLOAD_FILE_SIZE_BYTES, getMaxUploadFileSizeMessage } from '../common/upload.constants';
import {
  IMAGE_VARIANTS,
  type ImageVariant,
  type ProcessedImageVariant,
} from './image.types';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

@Injectable()
export class ImageProcessorService {
  async processImage(
    input: Buffer,
    mimeType: string,
    variants: ImageVariant[] = Object.keys(IMAGE_VARIANTS) as ImageVariant[],
  ): Promise<ProcessedImageVariant[]> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Поддерживаются только JPEG, PNG и WebP');
    }

    if (input.byteLength > MAX_UPLOAD_FILE_SIZE_BYTES) {
      throw new BadRequestException(getMaxUploadFileSizeMessage());
    }

    const results: ProcessedImageVariant[] = [];

    for (const variant of variants) {
      const config = IMAGE_VARIANTS[variant];
      let pipeline = sharp(input, { failOn: 'none' }).rotate();

      if ('maxWidth' in config) {
        pipeline = pipeline.resize(config.maxWidth, config.maxHeight, {
          fit: config.fit,
          withoutEnlargement: true,
        });
      } else {
        pipeline = pipeline.resize(config.width, config.height, {
          fit: config.fit,
          withoutEnlargement: true,
        });
      }

      const { data, info } = await pipeline
        .webp({
          quality: config.quality,
          effort: 4,
          smartSubsample: false,
        })
        .toBuffer({ resolveWithObject: true });

      results.push({
        variant,
        buffer: data,
        mimeType: 'image/webp',
        width: info.width,
        height: info.height,
        size: data.byteLength,
      });
    }

    return results;
  }
}
