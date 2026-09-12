const DEFAULT_TIMEZONE = 'Europe/Moscow';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

export function normalizeTimezone(timeZone?: string | null): string {
  const trimmed = timeZone?.trim();
  if (!trimmed) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat('en-GB', { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getZonedDateTimeParts(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: normalizeTimezone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    return {
      year: readPart(parts, 'year'),
      month: readPart(parts, 'month'),
      day: readPart(parts, 'day'),
      hour: readPart(parts, 'hour'),
      minute: readPart(parts, 'minute'),
    };
  } catch {
    return null;
  }
}

/** Стена Y-M-D H:M в поясе → UTC Date. */
export function wallTimeToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const zone = normalizeTimezone(timeZone);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getZonedDateTimeParts(new Date(utcMs), zone);
    if (!local) {
      break;
    }
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    );
    utcMs += wanted - got;
  }

  return new Date(utcMs);
}

/** Начало календарного дня YYYY-MM-DD в поясе пользователя. */
export function startOfZonedIsoDate(isoDate: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return null;
  }

  return wallTimeToUtcDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    0,
    0,
    timeZone,
  );
}

/** Конец календарного дня YYYY-MM-DD в поясе (последняя миллисекунда дня). */
export function endOfZonedIsoDate(isoDate: string, timeZone: string): Date | null {
  const start = startOfZonedIsoDate(isoDate, timeZone);
  if (!start) {
    return null;
  }

  const startParts = getZonedDateTimeParts(start, timeZone);
  if (!startParts) {
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  // Полдень + 24ч → соседний календарный день без сюрпризов на DST
  const noon = wallTimeToUtcDate(
    startParts.year,
    startParts.month,
    startParts.day,
    12,
    0,
    timeZone,
  );
  const nextNoonParts = getZonedDateTimeParts(
    new Date(noon.getTime() + 24 * 60 * 60 * 1000),
    timeZone,
  );
  if (!nextNoonParts) {
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  const nextStart = wallTimeToUtcDate(
    nextNoonParts.year,
    nextNoonParts.month,
    nextNoonParts.day,
    0,
    0,
    timeZone,
  );

  return new Date(nextStart.getTime() - 1);
}

/** Начало сегодняшнего дня в поясе пользователя. */
export function startOfTodayInTimeZone(timeZone: string, now = new Date()): Date {
  const parts = getZonedDateTimeParts(now, timeZone);
  if (!parts) {
    const fallback = new Date(now);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }

  return wallTimeToUtcDate(parts.year, parts.month, parts.day, 0, 0, timeZone);
}
