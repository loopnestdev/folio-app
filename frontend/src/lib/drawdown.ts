/**
 * maxDrawdownPct:
 *   - Largest peak-to-later-trough fall in a cumulative-return series (each value is % gain since the start, e.g. 58 = +58%), as a negative percentage
 *   - Works on growth factors (1 + v/100) against the running peak, so a fall from +598% to +400% is -28.4%, not the 198-point difference
 *   - Only a trough AFTER a peak counts; the old calculation paired the overall high with the overall low, even when the low came first
 *   - Skips nulls (chart gaps) and values at or below -100% (no meaningful factor); returns 0 for a series that never falls
 */
export function maxDrawdownPct(values: (number | null | undefined)[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of values) {
    if (v == null || v <= -100) continue;
    const factor = 1 + v / 100;
    if (factor > peak) peak = factor;
    const dd = (factor / peak - 1) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}
