import {
  aggregateSeriesPoints,
  computeLiquidity,
  computeStickinessPercent,
  formatDurationMs,
  formatMetricValue,
  resolveSeriesAggMode,
  weightedAverageRatio,
} from './analytics-aggregation.util';

describe('resolveSeriesAggMode', () => {
  it('uses last for gauges and sum for counters', () => {
    expect(resolveSeriesAggMode({ gauge: true })).toBe('last');
    expect(resolveSeriesAggMode({ gauge: false })).toBe('sum');
    expect(resolveSeriesAggMode({})).toBe('sum');
  });
});

describe('aggregateSeriesPoints', () => {
  it('takes last snapshot for users [40, 41, 43] → 43', () => {
    const points = [{ v: 40 }, { v: 41 }, { v: 43 }];
    expect(aggregateSeriesPoints(points, 'last')).toBe(43);
  });

  it('takes last snapshot for profiles [35, 36, 37] → 37', () => {
    expect(
      aggregateSeriesPoints([{ v: 35 }, { v: 36 }, { v: 37 }], 'last'),
    ).toBe(37);
  });

  it('sums event counters [2, 3, 1] → 6', () => {
    expect(aggregateSeriesPoints([{ v: 2 }, { v: 3 }, { v: 1 }], 'sum')).toBe(
      6,
    );
  });

  it('handles missing days without inventing values for last', () => {
    expect(
      aggregateSeriesPoints([{ v: 40 }, { v: 0 }, { v: 43 }], 'last'),
    ).toBe(43);
    expect(aggregateSeriesPoints([{ v: null }, { v: undefined }], 'last')).toBe(
      null,
    );
    expect(aggregateSeriesPoints([], 'sum')).toBe(null);
  });

  it('does not treat multi-day activity of one user as summed unique WAU', () => {
    // Unique-user windows are precomputed per day; week header must use last WAU,
    // not sum(DAU) / sum(WAU).
    const wauByDay = [{ v: 10 }, { v: 12 }, { v: 11 }];
    expect(aggregateSeriesPoints(wauByDay, 'last')).toBe(11);
    expect(aggregateSeriesPoints(wauByDay, 'sum')).toBe(33);
  });
});

describe('computeStickinessPercent', () => {
  it('DAU=19 MAU=28 → ≈67.86%', () => {
    expect(computeStickinessPercent(19, 28)).toBe(67.86);
  });

  it('returns null when MAU = 0', () => {
    expect(computeStickinessPercent(5, 0)).toBeNull();
    expect(computeStickinessPercent(0, 0)).toBeNull();
  });
});

describe('computeLiquidity', () => {
  it('profiles / open seats', () => {
    expect(computeLiquidity(37, 164)).toBe(0.2256);
  });

  it('null when no open seats', () => {
    expect(computeLiquidity(37, 0)).toBeNull();
  });
});

describe('weightedAverageRatio / retention', () => {
  it('does not turn immature empty cohorts into 0% retention', () => {
    expect(weightedAverageRatio([{ rate: 0, weight: 0 }])).toBeNull();
    expect(
      weightedAverageRatio([
        { rate: 0.5, weight: 10 },
        { rate: 0, weight: 0 },
      ]),
    ).toBe(0.5);
  });
});

describe('formatMetricValue', () => {
  it('formats counts, percents, ratios, durations, and missing', () => {
    expect(formatMetricValue(43, 'count')).toBe('43');
    expect(formatMetricValue(0.6786, 'percent01')).toBe('67.9%');
    expect(formatMetricValue(67.86, 'percent100')).toBe('67.9%');
    expect(formatMetricValue(3.5365, 'ratio')).toBe('3.54');
    expect(formatMetricValue(null, 'count')).toBe('—');
    expect(formatMetricValue(0, 'duration_ms')).toBe('—');
  });
});

describe('formatDurationMs', () => {
  it('humanizes durations', () => {
    expect(formatDurationMs(45_000)).toBe('45 с');
    expect(formatDurationMs(5 * 60_000)).toBe('5 мин');
    expect(formatDurationMs(2.5 * 3_600_000)).toBe('2 ч 30 мин');
  });
});

describe('event sum does not double-count when aggregating once', () => {
  it('summing daily event buckets once yields period total', () => {
    const registrations = [{ v: 2 }, { v: 3 }, { v: 1 }];
    expect(aggregateSeriesPoints(registrations, 'sum')).toBe(6);
    // Re-aggregating the same daily totals must not invent extras.
    expect(aggregateSeriesPoints(registrations, 'sum')).toBe(6);
  });
});
