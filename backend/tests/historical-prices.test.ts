// getHistoricalPrices against mocked Supabase + Yahoo: split re-base refresh and timezone fallback.
const upserts: any[][] = [];
let cachedWindow: { date: string; close_price: number }[] = [];
let firstCachedDate: string | null = null;

const query = (result: () => any) => {
  const q: any = {
    select: () => q, eq: () => q, gte: () => q, lte: () => q, limit: () => q, range: () => q,
    order: () => q,
    then: (resolve: any) => resolve(result()),
  };
  return q;
};
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => cols === 'date'
        ? query(() => ({ data: firstCachedDate ? [{ date: firstCachedDate }] : [] }))
        : query(() => ({ data: cachedWindow })),
      upsert: async (rows: any[]) => { upserts.push(rows); return { error: null }; },
    }),
  },
}));

const chart = jest.fn();
jest.mock('yahoo-finance2', () => ({ __esModule: true, default: class { chart = chart; } }));

import { getHistoricalPrices, toYahooTicker } from '../src/services/market-data/yahoo';

// A US bar stamped at the 9:30 New York open, i.e. 13:30/14:30 UTC on the same day.
const bar = (date: string, close: number) => ({ date: new Date(`${date}T14:30:00Z`), close });

beforeEach(() => { upserts.length = 0; chart.mockReset(); cachedWindow = []; firstCachedDate = null; });

describe('getHistoricalPrices', () => {
  it('refetches and saves the whole cached history when Yahoo has re-based it (split)', async () => {
    // Cache is stale at the end (forces a fetch) and on the pre-split basis.
    cachedWindow = [
      { date: '2026-03-02', close_price: 400 }, { date: '2026-03-03', close_price: 404 }, { date: '2026-03-04', close_price: 408 },
      { date: '2026-03-05', close_price: 410 }, { date: '2026-03-06', close_price: 412 }, { date: '2026-03-09', close_price: 414 },
    ];
    firstCachedDate = '2025-01-02';
    const meta = { exchangeTimezoneName: 'America/New_York' };
    chart
      .mockResolvedValueOnce({ meta, quotes: [bar('2026-03-09', 103.5), bar('2026-03-20', 105)] })
      .mockResolvedValueOnce({ meta, quotes: [bar('2025-01-02', 50), bar('2026-03-09', 103.5), bar('2026-03-20', 105)] });

    const prices = await getHistoricalPrices('XYZ', '2026-03-01', '2026-03-31', 'sec-1', 'US');

    expect(chart).toHaveBeenCalledTimes(2);
    expect(chart.mock.calls[1][1].period1).toBe('2025-01-02');
    expect(upserts.flat().map((r) => r.date)).toEqual(['2025-01-02', '2026-03-09', '2026-03-20']);
    expect(prices).toEqual([{ date: '2026-03-09', close: 103.5 }, { date: '2026-03-20', close: 105 }]);
  });

  it('saves only the requested window when the cache agrees with Yahoo', async () => {
    cachedWindow = [{ date: '2026-03-09', close_price: 103 }];
    chart.mockResolvedValueOnce({ meta: { exchangeTimezoneName: 'America/New_York' }, quotes: [bar('2026-03-09', 103.5), bar('2026-03-20', 105)] });

    await getHistoricalPrices('XYZ', '2026-03-01', '2026-03-31', 'sec-1', 'US');

    expect(chart).toHaveBeenCalledTimes(1);
    expect(upserts.flat().map((r) => r.date)).toEqual(['2026-03-09', '2026-03-20']);
  });

  it('serves cached prices when Yahoo returns nothing for the ticker (delisted / renamed)', async () => {
    // Cache ends long before toDate, so a refresh is attempted and comes back empty.
    cachedWindow = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-20']
      .map((date, i) => ({ date, close_price: 2.9 + i / 100 }));
    chart.mockResolvedValueOnce({ meta: { exchangeTimezoneName: 'America/New_York' }, quotes: [] });

    const prices = await getHistoricalPrices('GONE', '2026-01-12', '2026-10-09', 'sec-1', 'US');

    expect(prices).toHaveLength(6);
    expect(prices[0]).toEqual({ date: '2026-01-12', close: 2.9 });
    expect(upserts).toHaveLength(0);
  });

  it('keeps cached history when Yahoo returns only a live quote (Cboe .XA listing with no daily history)', async () => {
    cachedWindow = ['2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-07', '2025-07-29']
      .map((date) => ({ date, close_price: 8 }));
    chart
      .mockRejectedValueOnce(new Error('No data found, symbol may be delisted')) // IBTC.AX
      .mockResolvedValueOnce({ meta: { exchangeTimezoneName: 'Australia/Sydney' }, quotes: [{ date: new Date('2026-10-09T04:52:19Z'), close: 11.7 }] }); // IBTC.XA

    const prices = await getHistoricalPrices('IBTC', '2024-06-09', '2026-10-09', 'sec-1', 'ASX');

    expect(chart.mock.calls.map((c) => c[0])).toEqual(['IBTC.AX', 'IBTC.XA']);
    expect(prices).toHaveLength(7);
    expect(prices[0]).toEqual({ date: '2024-10-01', close: 8 });
    expect(prices[6]).toEqual({ date: '2026-10-09', close: 11.7 });
  });

  it('prefers fresh closes over cached ones on the same date', async () => {
    cachedWindow = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-09']
      .map((date) => ({ date, close_price: 100 }));
    chart.mockResolvedValueOnce({ meta: { exchangeTimezoneName: 'America/New_York' }, quotes: [bar('2026-03-09', 101), bar('2026-03-20', 105)] });

    const prices = await getHistoricalPrices('XYZ', '2026-03-01', '2026-03-31', 'sec-1', 'US');

    expect(prices.map((p) => `${p.date}=${p.close}`)).toEqual([
      '2026-03-02=100', '2026-03-03=100', '2026-03-04=100', '2026-03-05=100', '2026-03-06=100', '2026-03-09=101', '2026-03-20=105',
    ]);
  });

  it('serves cached prices when the Yahoo request throws', async () => {
    cachedWindow = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-20']
      .map((date) => ({ date, close_price: 3 }));
    chart.mockRejectedValueOnce(new Error('No data found, symbol may be delisted'));

    expect(await getHistoricalPrices('GONE', '2026-01-12', '2026-10-09', 'sec-1', 'US')).toHaveLength(6);
  });

  it('looks up a renamed ticker under its new symbol', async () => {
    expect(toYahooTicker('BITF', 'US')).toBe('KEEL');
    expect(toYahooTicker('BITF', 'ASX')).toBe('BITF.AX'); // rename is exchange-specific
    chart.mockResolvedValueOnce({ meta: { exchangeTimezoneName: 'America/New_York' }, quotes: [bar('2026-01-16', 2.95)] });

    await getHistoricalPrices('BITF', '2026-01-16', '2026-01-17', undefined, 'US');

    expect(chart.mock.calls[0][0]).toBe('KEEL');
  });

  it('dates ASX bars in Sydney time when Yahoo omits the timezone', async () => {
    // Friday 9 Jan 2026 session open (10:00 AEDT) = 23:00 UTC Thursday.
    chart.mockResolvedValueOnce({ meta: {}, quotes: [{ date: new Date('2026-01-08T23:00:00Z'), close: 66 }] });

    const prices = await getHistoricalPrices('NUGG', '2026-01-05', '2026-01-10', undefined, 'ASX');

    expect(prices).toEqual([{ date: '2026-01-09', close: 66 }]);
  });
});
