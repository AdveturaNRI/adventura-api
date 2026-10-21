export type AnnouncementThemeMode = 'light' | 'dark';
export type AnnouncementImageLayout = 'top' | 'side';
export type AnnouncementImageAspect = '16:9' | '4:3' | '1:1' | 'auto';
export type AnnouncementButtonStyle = 'filled' | 'outline';

export type AnnouncementTheme = {
  themeMode: AnnouncementThemeMode;
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  buttonColor: string;
  accentColor: string;
  imageLayout: AnnouncementImageLayout;
  imageAspect: AnnouncementImageAspect;
  /** Focal point X inside the crop frame, 0–100 (CSS object-position). */
  imageFocusX: number;
  /** Focal point Y inside the crop frame, 0–100. */
  imageFocusY: number;
  modalWidth: number;
  borderRadius: number;
  buttonStyle: AnnouncementButtonStyle;
  showImage: boolean;
  showActionButton: boolean;
  animationEnabled: boolean;
};

export const DEFAULT_ANNOUNCEMENT_THEME: AnnouncementTheme = {
  themeMode: 'light',
  backgroundColor: '#FFFFFF',
  titleColor: '#111827',
  bodyColor: '#374151',
  buttonColor: '#157AFE',
  accentColor: '#157AFE',
  imageLayout: 'top',
  imageAspect: '16:9',
  imageFocusX: 50,
  imageFocusY: 50,
  modalWidth: 480,
  borderRadius: 20,
  buttonStyle: 'filled',
  showImage: true,
  showActionButton: true,
  animationEnabled: true,
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const raw = asString(value)?.toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return fallback;
}

function asColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  return fallback;
}

export function normalizeAnnouncementTheme(input: unknown): AnnouncementTheme {
  const raw =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  return {
    themeMode: asEnum(
      raw.themeMode,
      ['light', 'dark'] as const,
      DEFAULT_ANNOUNCEMENT_THEME.themeMode,
    ),
    backgroundColor: asColor(
      raw.backgroundColor,
      DEFAULT_ANNOUNCEMENT_THEME.backgroundColor,
    ),
    titleColor: asColor(raw.titleColor, DEFAULT_ANNOUNCEMENT_THEME.titleColor),
    bodyColor: asColor(raw.bodyColor, DEFAULT_ANNOUNCEMENT_THEME.bodyColor),
    buttonColor: asColor(
      raw.buttonColor,
      DEFAULT_ANNOUNCEMENT_THEME.buttonColor,
    ),
    accentColor: asColor(
      raw.accentColor,
      DEFAULT_ANNOUNCEMENT_THEME.accentColor,
    ),
    imageLayout: asEnum(
      raw.imageLayout,
      ['top', 'side'] as const,
      DEFAULT_ANNOUNCEMENT_THEME.imageLayout,
    ),
    imageAspect: asEnum(
      raw.imageAspect,
      ['16:9', '4:3', '1:1', 'auto'] as const,
      DEFAULT_ANNOUNCEMENT_THEME.imageAspect,
    ),
    imageFocusX: clampInt(
      raw.imageFocusX,
      0,
      100,
      DEFAULT_ANNOUNCEMENT_THEME.imageFocusX,
    ),
    imageFocusY: clampInt(
      raw.imageFocusY,
      0,
      100,
      DEFAULT_ANNOUNCEMENT_THEME.imageFocusY,
    ),
    modalWidth: clampInt(
      raw.modalWidth,
      320,
      720,
      DEFAULT_ANNOUNCEMENT_THEME.modalWidth,
    ),
    borderRadius: clampInt(
      raw.borderRadius,
      0,
      32,
      DEFAULT_ANNOUNCEMENT_THEME.borderRadius,
    ),
    buttonStyle: asEnum(
      raw.buttonStyle,
      ['filled', 'outline'] as const,
      DEFAULT_ANNOUNCEMENT_THEME.buttonStyle,
    ),
    showImage: asBool(raw.showImage, DEFAULT_ANNOUNCEMENT_THEME.showImage),
    showActionButton: asBool(
      raw.showActionButton,
      DEFAULT_ANNOUNCEMENT_THEME.showActionButton,
    ),
    animationEnabled: asBool(
      raw.animationEnabled,
      DEFAULT_ANNOUNCEMENT_THEME.animationEnabled,
    ),
  };
}

/** Allow http(s) absolute URLs and same-app absolute paths. */
export function sanitizeActionUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = asString(value)?.trim() ?? '';
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    if (raw.length > 2048) return null;
    return raw;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.href.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

const ALLOWED_BODY_TAGS =
  /<\/?(?:p|br|strong|b|em|i|u|s|a|ul|ol|li|h2|h3|blockquote)(?:\s[^>]*)?>/gi;

/** Strip scripts/events; keep a small HTML subset for announcement bodies. */
export function sanitizeAnnouncementBody(value: unknown): string {
  const raw = asString(value) ?? '';
  if (!raw.trim()) return '';
  let cleaned = raw
    .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');

  cleaned = cleaned.replace(
    /<\/?([a-z0-9]+)(\s[^>]*)?>/gi,
    (match, tag: string) => {
      const lower = tag.toLowerCase();
      if (
        ![
          'p',
          'br',
          'strong',
          'b',
          'em',
          'i',
          'u',
          's',
          'a',
          'ul',
          'ol',
          'li',
          'h2',
          'h3',
          'blockquote',
        ].includes(lower)
      ) {
        return '';
      }
      if (lower === 'br') return '<br>';
      if (lower === 'a') {
        const hrefMatch = match.match(/\shref\s*=\s*(['"])(.*?)\1/i);
        const href = hrefMatch ? sanitizeActionUrl(hrefMatch[2]) : null;
        if (match.startsWith('</')) return '</a>';
        if (!href) return '';
        return `<a href="${href}" rel="noopener noreferrer" target="_blank">`;
      }
      if (match.startsWith('</')) return `</${lower}>`;
      return `<${lower}>`;
    },
  );

  // Collapse runaway length
  if (cleaned.length > 20_000) {
    return cleaned.slice(0, 20_000);
  }
  return cleaned;
}

// Keep reference so tree-shaking tools see ALLOWED_BODY_TAGS as intentional.
void ALLOWED_BODY_TAGS;
