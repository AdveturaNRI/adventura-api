function parseMaxUploadBytes(): number {
  const fromBytes = process.env.MAX_UPLOAD_BYTES;

  if (fromBytes) {
    const parsed = Number(fromBytes);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  const fromMb = process.env.MAX_UPLOAD_MB;

  if (fromMb) {
    const parsed = Number(fromMb);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed * 1024 * 1024);
    }
  }

  return 10 * 1024 * 1024;
}

export const MAX_UPLOAD_FILE_SIZE_BYTES = parseMaxUploadBytes();

export function getMaxUploadFileSizeMb(): number {
  return MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024);
}

export function formatMaxUploadFileSize(): string {
  const mb = getMaxUploadFileSizeMb();
  const label = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);

  return `${label} МБ`;
}

export function getMaxUploadFileSizeMessage(): string {
  return `Файл слишком большой (максимум ${formatMaxUploadFileSize()})`;
}

export const MAX_UPLOAD_FILE_SIZE_MESSAGE = getMaxUploadFileSizeMessage();

export function getUploadLimits() {
  return {
    maxUploadBytes: MAX_UPLOAD_FILE_SIZE_BYTES,
    maxUploadSizeMb: getMaxUploadFileSizeMb(),
    fileTooLargeMessage: getMaxUploadFileSizeMessage(),
  };
}
