// =============================================================================
// repair-asx-price-dates.ts — re-date ASX prices cached one day early
// Usage (from backend/):
//   - Dry run:  npm run repair:asx-dates
//   - Apply:    npm run repair:asx-dates -- --apply
//
// Background:
//   - Before the exchange-timezone fix in market-data/yahoo.ts, bar timestamps were formatted in the server's timezone
//   - On Railway (UTC) every ASX close was cached a day early: Friday's under Thursday, Monday's under Sunday, no Friday row
//   - Rows fetched locally (Australian timezone) were dated correctly, so the cache holds a mix of both
//
// What it does, for every ASX security in price_history and the ^AXJO benchmark in benchmark_data:
//   - Refetches Yahoo daily closes over the span already cached, dated in the exchange's timezone
//   - Deletes cached rows whose date is not a real trading day in the fresh data (the shifted Sunday / extra rows)
//   - Upserts the fresh rows, which corrects the value stored under every remaining date
//   - Skips a target Yahoo returns nothing for, leaving its rows untouched
//   - Without --apply it only prints what would change
// =============================================================================
import { supabase } from '../src/lib/supabase';
import { quoteDate, toYahooTicker } from '../src/services/market-data/yahoo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default as new (opts?: object) => {
  chart: (...args: any[]) => Promise<any>;
};
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

const APPLY = process.argv.includes('--apply');

type Price = { date: string; close: number };
type Target = { label: string; table: 'price_history' | 'benchmark_data'; keyCol: string; keyVal: string; tickers: string[] };

const nextDay = (date: string) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

async function cachedRows(t: Target): Promise<{ date: string; close_price: number }[]> {
  const rows: { date: string; close_price: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(t.table)
      .select('date, close_price')
      .eq(t.keyCol, t.keyVal)
      .order('date')
      .range(from, from + 999);
    if (error) throw new Error(`${t.label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function freshPrices(ticker: string, fromDate: string, toDate: string): Promise<Price[]> {
  const result = await yahooFinance.chart(ticker, { period1: fromDate, period2: nextDay(toDate), interval: '1d' });
  return ((result.quotes ?? []) as any[])
    .filter((q) => q.close != null)
    .map((q) => ({ date: quoteDate(q.date, result.meta?.exchangeTimezoneName), close: q.close as number }));
}

async function main() {
  const { data: secs, error } = await supabase.from('securities').select('id, symbol').eq('exchange', 'ASX');
  if (error) throw new Error(error.message);

  const targets: Target[] = (secs ?? []).map((s) => ({
    label: `${s.symbol}.ASX`, table: 'price_history', keyCol: 'security_id', keyVal: s.id,
    // Same .XA fallback getHistoricalPrices uses for Cboe-listed ASX securities
    tickers: [toYahooTicker(s.symbol, 'ASX'), `${s.symbol}.XA`],
  }));
  targets.push({ label: '^AXJO', table: 'benchmark_data', keyCol: 'index_symbol', keyVal: '^AXJO', tickers: ['^AXJO'] });

  let totalDeleted = 0, totalRevalued = 0, totalSkipped = 0;
  for (const t of targets) {
    const rows = await cachedRows(t);
    if (!rows.length) continue;
    const first = rows[0].date, last = rows[rows.length - 1].date;

    let fresh: Price[] = [];
    for (const ticker of t.tickers) {
      fresh = await freshPrices(ticker, first, last).catch(() => []);
      if (fresh.length) break;
    }
    if (!fresh.length) {
      totalSkipped++;
      console.log(`${t.label}: no Yahoo data, skipped (${rows.length} rows left as-is)`);
      continue;
    }

    const freshByDate = new Map(fresh.map((p) => [p.date, p.close]));
    const stale = rows.filter((r) => !freshByDate.has(r.date)).map((r) => r.date);
    const revalued = rows.filter((r) => {
      const f = freshByDate.get(r.date);
      return f !== undefined && Math.abs(f - r.close_price) > 1e-6 * Math.max(1, Math.abs(r.close_price));
    }).length;
    totalDeleted += stale.length;
    totalRevalued += revalued;
    if (stale.length || revalued) {
      console.log(`${t.label}: cached=${rows.length} delete=${stale.length} revalue=${revalued}${stale.length ? ` (e.g. ${stale.slice(0, 3).join(', ')})` : ''}`);
    }

    if (!APPLY) continue;
    for (let i = 0; i < stale.length; i += 200) {
      const { error: delErr } = await supabase.from(t.table).delete().eq(t.keyCol, t.keyVal).in('date', stale.slice(i, i + 200));
      if (delErr) throw new Error(`${t.label} delete: ${delErr.message}`);
    }
    const { error: upErr } = await supabase.from(t.table).upsert(
      fresh.map((p) => ({ [t.keyCol]: t.keyVal, date: p.date, close_price: p.close })),
      { onConflict: `${t.keyCol},date` },
    );
    if (upErr) throw new Error(`${t.label} upsert: ${upErr.message}`);
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'}: targets=${targets.length} rows-deleted=${totalDeleted} rows-revalued=${totalRevalued} skipped=${totalSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
