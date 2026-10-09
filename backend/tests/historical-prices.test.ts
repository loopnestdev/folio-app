// getHistoricalPrices against mocked Supabase + Yahoo: split re-base refresh and timezone fallback.
const upserts: any[][] = [];
let cachedWindow: { date: string; close_price: number }[] = [];
let firstCachedDate: string | null = null;

const query = (result: () => any) => {
  const q: any = {
    select: () => q, eq: () => q, gte: () => q, lte: () => q, limit: () => q,
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

import { getHistoricalPrices } from '../src/services/market-data/yahoo';

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

  it('dates ASX bars in Sydney time when Yahoo omits the timezone', async () => {
    // Friday 9 Jan 2026 session open (10:00 AEDT) = 23:00 UTC Thursday.
    chart.mockResolvedValueOnce({ meta: {}, quotes: [{ date: new Date('2026-01-08T23:00:00Z'), close: 66 }] });

    const prices = await getHistoricalPrices('NUGG', '2026-01-05', '2026-01-10', undefined, 'ASX');

    expect(prices).toEqual([{ date: '2026-01-09', close: 66 }]);
  });
});
