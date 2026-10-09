import type { PerformancePoint } from '../types';

export interface UnpricedSummary {
  symbol: string;
  days: number;
  from: string;
  to: string;
}

/** Per symbol: how many chart days it was held with no price (valued at $0), and the first/last such date. */
export function summarizeUnpriced(data: PerformancePoint[]): UnpricedSummary[] {
  const bySymbol = new Map<string, UnpricedSummary>();
  for (const point of data) {
    for (const symbol of point.unpriced ?? []) {
      const s = bySymbol.get(symbol);
      if (s) { s.days++; s.to = point.date; }
      else bySymbol.set(symbol, { symbol, days: 1, from: point.date, to: point.date });
    }
  }
  return [...bySymbol.values()].sort((a, b) => b.days - a.days || a.symbol.localeCompare(b.symbol));
}
