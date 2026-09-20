/** Pure helpers for analytics series aggregation / display (unit-tested). */

export type SeriesAggMode = 'sum' | 'last';

export type MetricValueFormat =
  'count' | 'percent01' | 'percent100' | 'ratio' | 'duration_ms';

export function resolveSeriesAggMode(options: {
  gauge?: boolean;
}): SeriesAggMode {
  return options.gauge ? 'last' : 'sum';
}

/**
 * Aggregate chart points for the period header.
 * - counters → sum
 * - gauges/snapshots → last finite value (not a sum of levels)
 */
export function aggregateSeriesPoints(
  points: Array<{ v: number | null | undefined }>,
  mode: SeriesAggMode,
): number | null {
  const values = points
    .map((p) => p.v)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (values.length === 0) {
    return null;
  }

  if (mode === 'last') {
    return values[values.length - 1] ?? null;
  }

  return values.reduce((acc, v) => acc + v, 0);
}

/** Classic stickiness: DAU / MAU × 100. null when MAU = 0. */
export function computeStickinessPercent(
  dau: number,
  mau: number,
): number | null {
  if (!Number.isFinite(dau) || !Number.isFinite(mau) || mau <= 0) {
    return null;
  }
  return Number(((dau / mau) * 100).toFixed(2));
}

/** Liquidity: active profiles per open seat (can be > 1). */
export function computeLiquidity(
  activeProfiles: number,
  openSeats: number,
): number | null {
  if (!Number.isFinite(activeProfiles) || !Number.isFinite(openSeats)) {
    return null;
  }
  if (openSeats <= 0) {
    return null;
  }
  return Number((activeProfiles / openSeats).toFixed(4));
}

export function formatMetricValue(
  value: number | null | undefined,
  format: MetricValueFormat = 'count',
): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  switch (format) {
    case 'percent01':
      return `${(value * 100).toFixed(1)}%`;
    case 'percent100':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'duration_ms':
      return formatDurationMs(value);
    case 'count':
    default:
      return Number.isInteger(value)
        ? String(value)
        : String(Math.round(value));
  }
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '—';
  }
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec} с`;
  }
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) {
    return `${totalMin} мин`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) {
    return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} д ${remHours} ч` : `${days} д`;
}

/**
 * Weighted mean of ratios by cohort sizes.
 * Empty / immature cohorts (weight 0) are excluded — not treated as 0%.
 */
export function weightedAverageRatio(
  samples: Array<{ rate: number; weight: number }>,
): number | null {
  let num = 0;
  let den = 0;
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.rate) ||
      !Number.isFinite(sample.weight) ||
      sample.weight <= 0
    ) {
      continue;
    }
    num += sample.rate * sample.weight;
    den += sample.weight;
  }
  if (den <= 0) {
    return null;
  }
  return Number((num / den).toFixed(4));
}
