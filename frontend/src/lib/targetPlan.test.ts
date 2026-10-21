import { describe, it, expect } from 'vitest';
import { groupPlan, sortPlanLines, allocationPie } from './targetPlan';
import { CHART_COLORS, UNALLOCATED_COLOR } from './utils';
import type { TargetPortfolio } from '../types';

const tp = (id: string, name: string, items: [string, number, string | null][]): TargetPortfolio => ({
  id, name, user_id: 'u', description: null, is_active: false, investable_amount: null, investable_currency: 'USD',
  created_at: '', updated_at: '',
  items: items.map(([symbol, allocation_pct, category], i) => ({
    id: id + symbol, target_portfolio_id: id, user_id: 'u', symbol, exchange: null, category, allocation_pct, sort_order: i, created_at: '',
  })),
});

describe('groupPlan', () => {
  const portfolios = [tp('etf', 'ETF', [['QQQ', 50, 'MAG7'], ['NVDA', 50, null]]), tp('ai', 'AI', [['NVDA', 25, 'AI'], ['MU', 75, null]])];

  it('weights each member, merges shared stocks and sizes dollars from the investable amount', () => {
    const plan = groupPlan([{ target_portfolio_id: 'etf', weight_pct: 40 }, { target_portfolio_id: 'ai', weight_pct: 60 }], portfolios, 300_000);
    expect(plan.map((l) => [l.symbol, l.pct, l.amount])).toEqual([['QQQ', 20, 60_000], ['NVDA', 35, 105_000], ['MU', 45, 135_000]]);
    expect(plan[1].sources.map((s) => s.name)).toEqual(['ETF', 'AI']);
    expect(plan[1].category).toBe('AI');
  });

  it('ignores members whose portfolio is not loaded', () => {
    expect(groupPlan([{ target_portfolio_id: 'missing', weight_pct: 100 }], portfolios, 1000)).toEqual([]);
  });
});

describe('sortPlanLines', () => {
  const line = (symbol: string, pct: number) => ({ symbol, category: null, pct, amount: 0, sources: [] });
  const lines = [line('NVDA', 6), line('AMD', 3), line('MU', 9), line('COHR', 3)];
  const syms = (l: { symbol: string }[]) => l.map((x) => x.symbol);

  it('sorts by symbol both ways', () => {
    expect(syms(sortPlanLines(lines, 'symbol', 'asc'))).toEqual(['AMD', 'COHR', 'MU', 'NVDA']);
    expect(syms(sortPlanLines(lines, 'symbol', 'desc'))).toEqual(['NVDA', 'MU', 'COHR', 'AMD']);
  });

  it('sorts by allocation both ways, ties broken by symbol', () => {
    expect(syms(sortPlanLines(lines, 'allocation', 'desc'))).toEqual(['MU', 'NVDA', 'AMD', 'COHR']);
    expect(syms(sortPlanLines(lines, 'allocation', 'asc'))).toEqual(['AMD', 'COHR', 'NVDA', 'MU']);
  });

  it('does not mutate the input', () => {
    sortPlanLines(lines, 'symbol', 'asc');
    expect(syms(lines)).toEqual(['NVDA', 'AMD', 'MU', 'COHR']);
  });
});

describe('allocationPie', () => {
  const line = (symbol: string, pct: number) => ({ symbol, pct, amount: pct * 10 });

  it('orders slices largest first, colours by rank, and merges repeated symbols', () => {
    const { data, colorOf } = allocationPie([line('AMD', 20), line('NVDA', 30), line('MU', 25), line('AMD', 25)]);
    expect(data.map((d) => [d.name, d.pct])).toEqual([['AMD', 45], ['NVDA', 30], ['MU', 25]]);
    expect(data[0].value).toBe(450);
    expect(colorOf.get('NVDA')).toBe(CHART_COLORS[1]);
  });

  it('adds an Unallocated slice when the plan is under 100%', () => {
    const { data, colorOf } = allocationPie([line('NVDA', 60), line('MU', 30)]);
    expect(data[2]).toEqual({ name: 'Unallocated', pct: 10, value: 0, color: UNALLOCATED_COLOR });
    expect(colorOf.has('Unallocated')).toBe(false);
  });

  it('skips blank symbols and zero allocations', () => {
    const { data } = allocationPie([line('', 50), line('NVDA', 0), line('MU', 100)]);
    expect(data.map((d) => d.name)).toEqual(['MU']);
  });

  it('is empty for an empty plan', () => {
    expect(allocationPie([]).data).toEqual([]);
  });
});
