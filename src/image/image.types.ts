export const IMAGE_VARIANTS = {
  thumb: { width: 64, height: 64, quality: 80, fit: 'cover' as const },
  small: { width: 128, height: 128, quality: 82, fit: 'cover' as const },
  medium: { width: 256, height: 256, quality: 85, fit: 'cover' as const },
  large: { width: 512, height: 512, quality: 88, fit: 'cover' as const },
  cardThumb: { width: 128, height: 170, quality: 82, fit: 'cover' as const },
  card: { width: 1200, height: 1600, quality: 92, fit: 'cover' as const },
  original: { maxWidth: 1200, maxHeight: 1600, quality: 92, fit: 'inside' as const },
} as const;

export type ImageVariant = keyof typeof IMAGE_VARIANTS;

export type ProcessedImageVariant = {
  variant: ImageVariant;
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};

export type ImageUrls = Partial<Record<ImageVariant, string>>;
