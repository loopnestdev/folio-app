import type { TargetPortfolio } from '../types';

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
