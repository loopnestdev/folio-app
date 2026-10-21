import type { DiversityAllocation, TargetPortfolio } from '../types';
import { CHART_COLORS, UNALLOCATED_COLOR } from './utils';

export interface PlanMember {
  target_portfolio_id: string;
  weight_pct: number;
}

export interface PlanLine {
  symbol: string;
  category: string | null;
  /** Share of the whole group, % (member weight x stock %) */
  pct: number;
  /** Planned dollars: investable x pct */
  amount: number;
  sources: { name: string; weight_pct: number; item_pct: number }[];
}

/**
 * groupPlan:
 *   - Per-stock plan for a target group, mirroring the backend's combineTargets so the edit page can preview before saving
 *   - Effective % = member weight x stock %; a stock in several members is merged into one line
 *   - Members whose target portfolio is not loaded are ignored
 */
export function groupPlan(members: PlanMember[], portfolios: TargetPortfolio[], investable: number): PlanLine[] {
  const byId = new Map(portfolios.map((p) => [p.id, p]));
  const lines = new Map<string, PlanLine>();
  for (const m of members) {
    const tp = byId.get(m.target_portfolio_id);
    if (!tp) continue;
    for (const item of [...tp.items].sort((a, b) => a.sort_order - b.sort_order)) {
      const pct = (m.weight_pct * Number(item.allocation_pct)) / 100;
      const source = { name: tp.name, weight_pct: m.weight_pct, item_pct: Number(item.allocation_pct) };
      const line = lines.get(item.symbol);
      if (line) {
        line.pct += pct;
        line.sources.push(source);
        line.category ??= item.category;
      } else {
        lines.set(item.symbol, { symbol: item.symbol, category: item.category, pct, amount: 0, sources: [source] });
      }
    }
  }
  return [...lines.values()].map((l) => ({ ...l, amount: (l.pct / 100) * investable }));
}

export type PlanSortKey = 'symbol' | 'allocation';
export type PlanSortDir = 'asc' | 'desc';

/** Sorted copy of a group plan: by symbol (alphabetical) or by allocation % (numeric). */
export function sortPlanLines(lines: PlanLine[], key: PlanSortKey, dir: PlanSortDir): PlanLine[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...lines].sort((a, b) =>
    key === 'allocation'
      ? factor * (a.pct - b.pct) || a.symbol.localeCompare(b.symbol)
      : factor * a.symbol.localeCompare(b.symbol),
  );
}

/**
 * allocationPie:
 *   - Pie slices for a plan's per-stock allocation, largest first, merging repeated symbols
 *   - Coloured by size rank so neighbouring slices differ; `colorOf` gives each symbol's colour for a list beside the chart
 *   - Anything short of 100% becomes a neutral "Unallocated" slice
 */
export function allocationPie(lines: { symbol: string; pct: number; amount: number }[]): {
  data: DiversityAllocation[];
  colorOf: Map<string, string>;
} {
  const bySymbol = new Map<string, { pct: number; amount: number }>();
  for (const l of lines) {
    if (!l.symbol || !(l.pct > 0)) continue;
    const prev = bySymbol.get(l.symbol);
    bySymbol.set(l.symbol, { pct: (prev?.pct ?? 0) + l.pct, amount: (prev?.amount ?? 0) + l.amount });
  }
  const data: DiversityAllocation[] = [...bySymbol]
    .sort(([as, a], [bs, b]) => b.pct - a.pct || as.localeCompare(bs))
    .map(([name, { pct, amount }], i) => ({ name, pct, value: amount, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const colorOf = new Map(data.map((d) => [d.name, d.color!]));
  const total = data.reduce((s, d) => s + d.pct, 0);
  if (data.length && total < 99.99) data.push({ name: 'Unallocated', pct: 100 - total, value: 0, color: UNALLOCATED_COLOR });
  return { data, colorOf };
}
