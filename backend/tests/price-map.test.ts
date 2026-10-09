jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { buildDailyPriceMap, calculateHoldings, unpricedSymbols } from '../src/services/calculations/holdings';
import { benchmarkTimeZone, dedupeByDate, exchangeTimeZone, hasAdjustmentMismatch, quoteDate, unadjustForSplits } from '../src/services/market-data/yahoo';

describe('buildDailyPriceMap', () => {
  it('forward-fills a symbol with no row on a date instead of leaving it unpriced', () => {
    // NUGG has no Friday row (as with the timezone-shifted cache); MU has every day.
    const map = buildDailyPriceMap([
      { symbol: 'NUGG', prices: [{ date: '2026-01-08', close: 66.2 }, { date: '2026-01-12', close: 68.0 }] },
      { symbol: 'MU',   prices: [{ date: '2026-01-08', close: 100 }, { date: '2026-01-09', close: 101 }, { date: '2026-01-12', close: 102 }] },
    ]);
    expect(Object.keys(map)).toEqual(['2026-01-08', '2026-01-09', '2026-01-12']);
    expect(map['2026-01-09']).toEqual({ NUGG: 66.2, MU: 101 });
    expect(map['2026-01-12']).toEqual({ NUGG: 68.0, MU: 102 });
  });

  it('carries the last close onto a trailing date only some symbols have reached', () => {
    const map = buildDailyPriceMap([
      { symbol: 'MU',   prices: [{ date: '2026-10-07', close: 1088 }] },
      { symbol: 'NVDA', prices: [{ date: '2026-10-07', close: 190 }, { date: '2026-10-08', close: 192 }] },
    ]);
    expect(map['2026-10-08']).toEqual({ MU: 1088, NVDA: 192 });
  });

  it('drops weekend-dated rows', () => {
    const map = buildDailyPriceMap([
      { symbol: 'IPX', prices: [{ date: '2026-01-09', close: 6.4 }, { date: '2026-01-11', close: 6.52 }, { date: '2026-01-12', close: 6.68 }] },
    ]);
    expect(Object.keys(map)).toEqual(['2026-01-09', '2026-01-12']);
  });

  it('leaves a symbol absent before its first price', () => {
    const map = buildDailyPriceMap([
      { symbol: 'A', prices: [{ date: '2026-01-05', close: 1 }, { date: '2026-01-06', close: 2 }] },
      { symbol: 'B', prices: [{ date: '2026-01-06', close: 5 }] },
    ]);
    expect(map['2026-01-05']).toEqual({ A: 1 });
  });

  it('keeps a held position valued on a date its own price row is missing', () => {
    const map = buildDailyPriceMap([
      { symbol: 'NUGG', prices: [{ date: '2026-01-08', close: 66 }] },
      { symbol: 'MU',   prices: [{ date: '2026-01-08', close: 100 }, { date: '2026-01-09', close: 101 }] },
    ]);
    const trades = [{
      id: '1', portfolio_id: 'p', trade_date: '2026-01-02', trade_type: 'buy', quantity: 10, price: 60, brokerage: 0,
      currency: 'AUD', security: { symbol: 'NUGG', name: 'NUGG', exchange: 'ASX', currency: 'AUD' },
    }];
    const [h] = calculateHoldings(trades as any, map['2026-01-09']);
    expect(h.market_value).toBe(660);
  });
});

describe('quoteDate', () => {
  // Yahoo stamps an ASX daily bar at the session open in Sydney time, which is the previous day in UTC.
  const asxFridayBar = '2026-01-08T23:00:00.000Z'; // Fri 9 Jan 2026 10:00 AEDT

  it('formats in the exchange timezone', () => {
    expect(quoteDate(asxFridayBar, 'Australia/Sydney')).toBe('2026-01-09');
    expect(quoteDate('2026-01-09T14:30:00.000Z', 'America/New_York')).toBe('2026-01-09');
  });

  it('falls back to UTC without a timezone', () => {
    expect(quoteDate(asxFridayBar, undefined)).toBe('2026-01-08');
  });
});

describe('dedupeByDate', () => {
  it('keeps the last row per date (the live quote Yahoo appends after the daily bar) without reordering', () => {
    const rows = [
      { date: '2026-10-08', close: 10.0 },
      { date: '2026-10-09', close: 10.1 },
      { date: '2026-10-09', close: 10.13 },
    ];
    expect(dedupeByDate(rows)).toEqual([{ date: '2026-10-08', close: 10.0 }, { date: '2026-10-09', close: 10.13 }]);
  });
});

describe('unpricedSymbols', () => {
  it('lists held symbols with no price and ignores priced or sold-out ones', () => {
    const t = (symbol: string, trade_type: string, quantity: number) => ({
      id: symbol + trade_type, portfolio_id: 'p', trade_date: '2026-01-02', trade_type, quantity, price: 10, brokerage: 0,
      currency: 'AUD', security: { symbol, name: symbol, exchange: 'ASX', currency: 'AUD' },
    });
    const holdings = calculateHoldings(
      [t('IBTC', 'buy', 5), t('NUGG', 'buy', 5), t('OLD', 'buy', 5), t('OLD', 'sell', 5)] as any,
      { NUGG: 66 },
    );
    expect(unpricedSymbols(holdings)).toEqual(['IBTC']);
  });
});

describe('timezone fallbacks', () => {
  it('maps exchanges and benchmarks to their trading timezone', () => {
    expect(exchangeTimeZone('ASX')).toBe('Australia/Sydney');
    expect(exchangeTimeZone('HK')).toBe('Asia/Hong_Kong');
    expect(exchangeTimeZone('US')).toBe('America/New_York');
    expect(benchmarkTimeZone('^AXJO')).toBe('Australia/Sydney');
    expect(benchmarkTimeZone('^GSPC')).toBe('America/New_York');
  });
});

describe('hasAdjustmentMismatch', () => {
  const cached = [{ date: '2026-03-02', close: 400 }, { date: '2026-03-03', close: 404 }];

  it('flags a split re-base (4-for-1) on overlapping dates', () => {
    expect(hasAdjustmentMismatch(cached, [{ date: '2026-03-03', close: 101 }, { date: '2026-03-04', close: 102 }])).toBe(true);
  });

  it('ignores small corrections and non-overlapping dates', () => {
    expect(hasAdjustmentMismatch(cached, [{ date: '2026-03-03', close: 410 }, { date: '2026-03-09', close: 90 }])).toBe(false);
    expect(hasAdjustmentMismatch([], [{ date: '2026-03-03', close: 1 }])).toBe(false);
  });
});

describe('unadjustForSplits', () => {
  it('restores pre-consolidation prices (CEL 1:20 on 2026-07-29)', () => {
    const closes = [{ date: '2026-02-05', close: 3.1 }, { date: '2026-07-28', close: 4 }, { date: '2026-07-29', close: 4.2 }];
    const out = unadjustForSplits(closes, [{ date: '2026-07-29', numerator: 1, denominator: 20 }]);
    expect(out[0].close).toBeCloseTo(0.155, 6);
    expect(out[1].close).toBeCloseTo(0.2, 6);
    expect(out[2].close).toBe(4.2); // split-day close is already post-split
  });

  it('compounds several splits and handles forward splits', () => {
    const out = unadjustForSplits([{ date: '2024-01-02', close: 10 }], [
      { date: '2024-06-10', numerator: 4, denominator: 1 },  // 4-for-1 split: old shares traded 4x higher
      { date: '2025-01-15', numerator: 1, denominator: 10 }, // later 1-for-10 consolidation
    ]);
    expect(out[0].close).toBeCloseTo(4, 6);
  });

  it('returns closes unchanged without splits', () => {
    const closes = [{ date: '2026-01-02', close: 5 }];
    expect(unadjustForSplits(closes, [])).toBe(closes);
  });
});
