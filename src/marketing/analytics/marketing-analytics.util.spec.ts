import { computeCostPer } from './marketing-analytics.util';

describe('computeCostPer', () => {
  it('returns null when spend is 0', () => {
    expect(computeCostPer(0, 10)).toBeNull();
  });

  it('returns null when denominator is 0', () => {
    expect(computeCostPer(100, 0)).toBeNull();
  });

  it('returns a number when both are positive', () => {
    expect(computeCostPer(100, 25)).toBe(4);
  });
});

