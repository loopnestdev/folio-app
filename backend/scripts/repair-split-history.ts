// =============================================================================
// repair-split-history.ts — rewrite cached closes stored on Yahoo's split-adjusted basis
// Usage (from backend/):
//   - Dry run:  npm run repair:splits
//   - Apply:    npm run repair:splits -- --apply
//
// Background:
//   - Yahoo rescales every close before a split or consolidation to the post-split share count
//   - Trades are stored in the shares held at the time, so positions held before a later split were valued at the wrong scale (CEL 20x after its 1:20 consolidation, LCID 10x after its 1:10)
//   - getHistoricalPrices now stores closes as traded (unadjustForSplits), but rows cached earlier keep the adjusted values until refetched, and an up-to-date cache is never refetched
//
// What it does, for every security with cached prices:
//   - Refetches Yahoo closes over the cached span, as traded (same fetch the app uses)
//   - Upserts the fresh close for every cached date that differs by more than 1%; never deletes a row
//   - Skips a security, leaving its rows untouched, when Yahoo returns fewer than half as many rows as are cached (e.g. a delisted ticker with history only in the cache)
//   - Skips the CASH placeholder security
//   - Without --apply it only prints what would change
// =============================================================================
import { supabase } from '../src/lib/supabase';
import { exchangeTimeZone, fetchDailyCloses, toYahooTicker } from '../src/services/market-data/yahoo';

const APPLY = process.argv.includes('--apply');
const MIN_COVERAGE = 0.5;
const TOLERANCE = 0.01;

async function cachedRows(securityId: string): Promise<{ date: string; close_price: number }[]> {
  const rows: { date: string; close_price: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('price_history')
      .select('date, close_price')
      .eq('security_id', securityId)
      .order('date')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  const { data: secs, error } = await supabase.from('securities').select('id, symbol, exchange');
  if (error) throw new Error(error.message);

  let changedSecurities = 0, changedRows = 0, skipped = 0;
  for (const s of secs ?? []) {
    // CASH is the placeholder security for cash-line trades; its cache holds an unrelated Yahoo ticker and is never valued
    if (s.symbol === 'CASH') continue;
    const rows = await cachedRows(s.id);
    if (!rows.length) continue;
    const first = rows[0].date, last = rows[rows.length - 1].date;
    const tz = exchangeTimeZone(s.exchange);

    // Same ticker order getHistoricalPrices uses: renamed/primary ticker, then .XA for Cboe-listed ASX securities
    const tickers = [toYahooTicker(s.symbol, s.exchange), ...((s.exchange ?? '').toUpperCase() === 'ASX' ? [`${s.symbol}.XA`] : [])];
    let fresh: { date: string; close: number }[] = [];
    for (const ticker of tickers) {
      fresh = await fetchDailyCloses(ticker, first, last, tz).catch(() => []);
      if (fresh.length) break;
    }
    if (fresh.length < rows.length * MIN_COVERAGE) {
      if (rows.length > 5) {
        skipped++;
        console.log(`${s.symbol}.${s.exchange}: Yahoo returned ${fresh.length} rows for ${rows.length} cached, skipped`);
      }
      continue;
    }

    const freshByDate = new Map(fresh.map((p) => [p.date, p.close]));
    const changed = rows
      .filter((r) => {
        const f = freshByDate.get(r.date);
        return f !== undefined && r.close_price > 0 && Math.abs(f / r.close_price - 1) > TOLERANCE;
      })
      .map((r) => ({ date: r.date, cached: r.close_price, fresh: freshByDate.get(r.date)! }));
    if (!changed.length) continue;

    changedSecurities++;
    changedRows += changed.length;
    const sample = changed.slice(0, 3).map((c) => `${c.date} ${c.cached} -> ${Number(c.fresh.toPrecision(6))}`).join(', ');
    console.log(`${s.symbol}.${s.exchange}: ${changed.length} of ${rows.length} rows differ (e.g. ${sample})`);

    if (!APPLY) continue;
    for (let i = 0; i < changed.length; i += 1000) {
      const { error: upErr } = await supabase.from('price_history').upsert(
        changed.slice(i, i + 1000).map((c) => ({ security_id: s.id, date: c.date, close_price: c.fresh })),
        { onConflict: 'security_id,date' },
      );
      if (upErr) throw new Error(`${s.symbol} upsert: ${upErr.message}`);
    }
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'}: securities-changed=${changedSecurities} rows-rewritten=${changedRows} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
