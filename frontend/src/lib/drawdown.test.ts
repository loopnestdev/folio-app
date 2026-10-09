import { describe, it, expect } from 'vitest';
import { maxDrawdownPct } from './drawdown';

describe('maxDrawdownPct', () => {
  it('ignores a low that comes before the peak', () => {
    // Early dip to -4.3% from the start, then a run to +598% with no fall afterwards: the old formula reported -86%.
    expect(maxDrawdownPct([0, -4.3, 100, 300, 598.3])).toBeCloseTo(-4.3, 5);
  });

  it('measures the fall from the running peak in growth terms', () => {
    // +598.3% -> +400%: 5.0 / 6.983 - 1 = -28.4%
    expect(maxDrawdownPct([0, -4.3, 598.3, 400, 450])).toBeCloseTo(-28.4, 1);
  });

  it('keeps the deepest of several drawdowns', () => {
    expect(maxDrawdownPct([0, 20, 8, 50, 20, 60])).toBeCloseTo(-20, 5); // 1.5 -> 1.2
  });

  it('skips nulls and values at or below -100%', () => {
    expect(maxDrawdownPct([0, null, 10, undefined, -100, 5])).toBeCloseTo((1.05 / 1.1 - 1) * 100, 5);
  });

  it('returns 0 for empty or rising series', () => {
    expect(maxDrawdownPct([])).toBe(0);
    expect(maxDrawdownPct([0, 1, 2, 3])).toBe(0);
  });
});
