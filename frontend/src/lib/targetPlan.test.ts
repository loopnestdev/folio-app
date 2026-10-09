import { describe, it, expect } from 'vitest';
import { groupPlan } from './targetPlan';
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
