jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import {
  buildRebalanceRows, combineTargets, estimateOpenCgt, taxSummary,
  type ComparisonHolding, type TargetMemberInput,
} from '../src/services/rebalance/rebalance';

const item = (symbol: string, allocation_pct: number, sort_order = 0, category: string | null = null) =>
  ({ symbol, exchange: 'NASDAQ', category, allocation_pct, sort_order });

const trade = (trade_type: string, trade_date: string, quantity: number, price: number) =>
  ({ id: trade_type + trade_date, portfolio_id: 'p', trade_type, trade_date, quantity, price, brokerage: 0, currency: 'USD', security: { symbol: 'X', name: 'X', exchange: 'US', currency: 'USD' } }) as any;

describe('combineTargets', () => {
  const members: TargetMemberInput[] = [
    { target_portfolio_id: 'etf', name: 'ETF', weight_pct: 40, items: [item('QQQ', 50, 0, 'MAG7'), item('NVDA', 50, 1)] },
    { target_portfolio_id: 'ai', name: 'AI', weight_pct: 60, items: [item('NVDA', 25, 0, 'AI'), item('MU', 75, 1)] },
  ];

  it('applies member weights and merges a stock held by several members', () => {
    const lines = combineTargets(members);
    expect(lines.map((l) => [l.symbol, l.allocation_pct])).toEqual([['QQQ', 20], ['NVDA', 35], ['MU', 45]]);
    const nvda = lines.find((l) => l.symbol === 'NVDA')!;
    expect(nvda.sources.map((s) => s.name)).toEqual(['ETF', 'AI']);
    expect(nvda.category).toBe('AI'); // first non-null category
  });

  it('treats a single target portfolio as one member at 100%', () => {
    expect(combineTargets([{ target_portfolio_id: 't', name: 'T', weight_pct: 100, items: [item('A', 60), item('B', 40, 1)] }])
      .map((l) => l.allocation_pct)).toEqual([60, 40]);
  });

  it('leaves the unweighted remainder unallocated when weights or items do not reach 100', () => {
    const total = combineTargets([{ target_portfolio_id: 't', name: 'T', weight_pct: 50, items: [item('A', 94)] }])
      .reduce((s, l) => s + l.allocation_pct, 0);
    expect(total).toBe(47);
  });
});

describe('buildRebalanceRows', () => {
  const holding = (symbol: string, market_value: number, extra: Partial<ComparisonHolding> = {}): ComparisonHolding =>
    ({ symbol, market_value, current_price: 10, fx: 1, trades: [], ...extra });

  it('sizes targets from the base value and classifies BUY / SELL / HOLD / EXIT', () => {
    const targets = combineTargets([{ target_portfolio_id: 't', name: 'T', weight_pct: 100, items: [item('A', 50), item('B', 30, 1), item('C', 20, 2)] }]);
    const rows = buildRebalanceRows(targets, [holding('A', 3000), holding('B', 4000), holding('C', 2050), holding('OLD', 500), holding('CASH', 999)], 10_000);
    expect(rows.map((r) => [r.symbol, r.action, Math.round(r.diff)])).toEqual([
      ['A', 'BUY', 2000], ['B', 'SELL', -1000], ['C', 'HOLD', -50], ['OLD', 'EXIT', -500],
    ]);
  });

  it('uses a different base (investable amount) without changing current values', () => {
    const targets = combineTargets([{ target_portfolio_id: 't', name: 'T', weight_pct: 100, items: [item('A', 100)] }]);
    const [row] = buildRebalanceRows(targets, [holding('A', 3000)], 50_000);
    expect(row.target_value).toBe(50_000);
    expect(row.current_value).toBe(3000);
    expect(row.action).toBe('BUY');
  });
});

describe('estimateOpenCgt', () => {
  const today = new Date('2026-10-09').getTime();

  it('splits the gain on remaining FIFO lots into short and long term, in the comparison currency', () => {
    const h: ComparisonHolding = {
      symbol: 'X', market_value: 0, current_price: 20, fx: 1.5,
      trades: [trade('buy', '2024-01-02', 10, 5), trade('buy', '2026-06-01', 10, 15), trade('sell', '2024-06-01', 5, 8)],
    };
    // Sell 10 shares (300 in comparison currency at fx 1.5): 5 left from the 2024 lot (long term), 5 from the 2026 lot (short term)
    const { longTermGain, shortTermGain } = estimateOpenCgt(h, 300, today);
    expect(longTermGain).toBeCloseTo(5 * (20 - 5) * 1.5);
    expect(shortTermGain).toBeCloseTo(5 * (20 - 15) * 1.5);
  });

  it('returns zero without a price', () => {
    expect(estimateOpenCgt({ symbol: 'X', market_value: 0, current_price: null, fx: 1, trades: [] }, 100)).toEqual({ shortTermGain: 0, longTermGain: 0 });
  });
});

describe('taxSummary', () => {
  it('applies 15% to short-term gains, 10% effective to long-term, and orders sells loss -> long -> short', () => {
    const row = (symbol: string, st: number, lt: number, tax_tier: any) =>
      ({ symbol, action: 'SELL', short_term_gain: st, long_term_gain: lt, tax_tier } as any);
    const s = taxSummary([row('A', 1000, 0, 'short_term'), row('B', 0, 3000, 'long_term'), row('C', -200, 0, 'loss')]);
    expect(s.estimated_tax_short_term).toBeCloseTo(120); // (1000 - 200) x 15%
    expect(s.estimated_tax_long_term).toBeCloseTo(300);
    expect(s.sell_order).toEqual({ loss_symbols: ['C'], long_term_symbols: ['B'], short_term_symbols: ['A'] });
  });
});
