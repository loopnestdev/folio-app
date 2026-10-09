// yahoo-finance2 v3 exports the class as the default — create a single instance.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require('yahoo-finance2').default as new () => {
  chart:         (...args: any[]) => Promise<any>;
  quoteSummary:  (...args: any[]) => Promise<any>;
};
const yahooFinance = new YahooFinanceClass();
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';

export const BENCHMARKS = {
  ASX200: '^AXJO',
  SP500: '^GSPC',
  NASDAQ: '^IXIC',
} as const;

/**
 * quoteDate:
 *   - Formats a Yahoo daily-bar timestamp as YYYY-MM-DD in the exchange's own timezone (chart `meta.exchangeTimezoneName`)
 *   - Formatting in the server's timezone shifted ASX bars a day early on Railway (UTC): Friday's close was stored as Thursday and Monday's as Sunday
 *   - Callers pass a fallback from exchangeTimeZone / benchmarkTimeZone for when Yahoo omits it; UTC is the last resort (correct for FX, a day early for ASX)
 */
export function quoteDate(timestamp: string | number | Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp));
}

/**
 * exchangeTimeZone:
 *   - Fallback trading timezone for a security's exchange, used only when Yahoo's chart meta has no exchangeTimezoneName
 *   - Without it the fallback would be UTC, which dates every ASX bar a day early (the bug quoteDate fixed)
 */
export function exchangeTimeZone(exchange?: string | null): string {
  switch ((exchange ?? '').toUpperCase()) {
    case 'ASX': return 'Australia/Sydney';
    case 'HK':  return 'Asia/Hong_Kong';
    default:    return 'America/New_York';
  }
}

/** Fallback trading timezone for a benchmark index (see exchangeTimeZone). */
export function benchmarkTimeZone(indexSymbol: string): string {
  return indexSymbol === BENCHMARKS.ASX200 ? 'Australia/Sydney' : 'America/New_York';
}

/**
 * hasAdjustmentMismatch:
 *   - True when any date present in both sets differs by more than `tolerance` (default 15%)
 *   - Yahoo closes are split-adjusted as of when they are fetched, so after a split or consolidation every older close is re-based (e.g. /4 for a 4-for-1) while cached rows keep the old basis
 *   - Ordinary corrections are well under 15%; a mismatch above it means the cached history is on a different basis and must be refetched as a whole
 */
export function hasAdjustmentMismatch(
  cached: { date: string; close: number }[],
  fresh: { date: string; close: number }[],
  tolerance = 0.15,
): boolean {
  const freshByDate = new Map(fresh.map((p) => [p.date, p.close]));
  return cached.some((c) => {
    const f = freshByDate.get(c.date);
    return f !== undefined && c.close > 0 && Math.abs(f / c.close - 1) > tolerance;
  });
}

/**
 * dedupeByDate:
 *   - Keeps the last row for each date, preserving order
 *   - During a trading session Yahoo appends a live quote after the day's daily bar, and both now format to the same date
 *   - Without this, the price_history / benchmark_data upsert fails ("cannot affect row a second time") and the fetch returns nothing
 */
export function dedupeByDate<T extends { date: string }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const row of rows) byDate.set(row.date, row); // overwriting keeps the first occurrence's position
  return [...byDate.values()];
}

/**
 * TICKER_RENAMES:
 *   - Securities whose ticker changed after they were traded, keyed EXCHANGE:OLD -> new bare ticker
 *   - Yahoo moves the whole price history to the new ticker and returns nothing for the old one, so the old security could not be priced or refreshed
 *   - The security, its trades and CGT records keep the ticker shown on the broker statements; only price lookups use the new one
 *   - To add one: confirm on Yahoo that the new ticker's history covers the old ticker's cached prices, then add an entry here
 */
export const TICKER_RENAMES: Record<string, string> = {
  'US:BITF': 'KEEL', // Bitfarms -> Keel Infrastructure Corp. (NASDAQ), history matches cached BITF closes exactly
};

/**
 * Convert a bare ticker + exchange to the Yahoo Finance symbol format.
 *   ASX   → TICKER.AX   (e.g. FANG.AX, VAS.AX)
 *   HK    → TICKER.HK   (e.g. 0700.HK)
 *   US/NYSE/NASDAQ → TICKER  (no suffix needed)
 * Renamed tickers (TICKER_RENAMES) resolve to their new symbol first.
 */
export function toYahooTicker(symbol: string, exchange?: string | null): string {
  symbol = TICKER_RENAMES[`${(exchange ?? '').toUpperCase()}:${symbol.toUpperCase()}`] ?? symbol;
  switch ((exchange ?? '').toUpperCase()) {
    case 'ASX':  return `${symbol}.AX`;
    case 'HK':   return `${symbol}.HK`;
    default:     return symbol;
  }
}

type DailyClose = { date: string; close: number };

/** Daily closes for a Yahoo ticker over [fromDate, toDate], dated in the exchange's timezone, one row per date. */
async function fetchDailyCloses(ticker: string, fromDate: string, toDate: string, fallbackTimeZone: string): Promise<DailyClose[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.chart(ticker, {
    period1: fromDate,
    period2: toDate,
    interval: '1d',
  });
  const timeZone = result.meta?.exchangeTimezoneName ?? fallbackTimeZone;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dedupeByDate(((result.quotes ?? []) as any[])
    .filter((q) => q.close != null)
    .map((q) => ({
      date: quoteDate(q.date as string, timeZone),
      close: q.close as number,
    })));
}

/** Upserts closes into price_history in chunks (a full-history refresh can be thousands of rows). */
async function savePriceHistory(securityId: string, prices: DailyClose[]): Promise<void> {
  for (let i = 0; i < prices.length; i += 1000) {
    await supabase.from('price_history').upsert(
      prices.slice(i, i + 1000).map((p) => ({ security_id: securityId, date: p.date, close_price: p.close })),
      { onConflict: 'security_id,date' },
    );
  }
}

export async function getHistoricalPrices(
  symbol: string,
  fromDate: string,
  toDate: string,
  securityId?: string,
  exchange?: string | null,
): Promise<{ date: string; close: number }[]> {
  let cachedRows: DailyClose[] = [];
  if (securityId) {
    // Paged: PostgREST caps a response at 1000 rows, which cut long histories (FANG has 1,600+) short,
    // so the end-of-range check always saw a stale cache and the Yahoo-failure fallback lost recent closes.
    const cached: { date: string; close_price: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from('price_history')
        .select('date, close_price')
        .eq('security_id', securityId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true })
        .range(from, from + 999);
      cached.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }

    if (cached.length > 5) {
      // Use cache only if it covers both ends of the requested range well.
      //
      // Start check: a previous query for a shorter range (e.g. 1Y) may have
      // populated the cache with only recent data — its earliest row could be
      // months after fromDate. In that case the priceMap would be empty for the
      // portfolio's full history, all pre-cache-start dates would show
      // totalValue ≤ 0, and chartStartIdx would never be found → "No performance data".
      //
      // End check: the cache may be stale at the trailing end. When some holdings
      // are cached through an older date (e.g. Friday May 29) but others have
      // more recent data (e.g. Monday June 1), the priceMap will include June 1
      // but the stale holding has no entry → calculateHoldings returns
      // market_value: null → treated as 0 → portfolio value drops artificially.
      // We allow a 3-day gap at the end (covers Mon request against Fri cache);
      // anything larger triggers a fresh Yahoo Finance fetch.
      const firstCached = new Date(cached[0].date as string);
      const lastCached  = new Date(cached[cached.length - 1].date as string);
      const reqFrom     = new Date(fromDate);
      const reqTo       = new Date(toDate);
      const startDiff   = (firstCached.getTime() - reqFrom.getTime()) / 86_400_000;
      const endDiff     = (reqTo.getTime()    - lastCached.getTime()) / 86_400_000;
      cachedRows = cached.map((r) => ({ date: r.date as string, close: r.close_price as number }));
      if (startDiff <= 7 && endDiff <= 3) {
        return cachedRows;
      }
      // Cache doesn't adequately cover the requested range — fall through to a
      // fresh Yahoo Finance fetch (upsert will update stale rows in-place).
    }
  }

  const timeZone = exchangeTimeZone(exchange);
  try {
    let ticker = toYahooTicker(symbol, exchange);
    let prices = await fetchDailyCloses(ticker, fromDate, toDate, timeZone).catch(() => [] as DailyClose[]);

    // Some ASX-listed securities (Cboe/Chi-X) use .XA instead of .AX on Yahoo Finance
    if (!prices.length && (exchange ?? '').toUpperCase() === 'ASX') {
      ticker = `${symbol}.XA`;
      prices = await fetchDailyCloses(ticker, fromDate, toDate, timeZone).catch(() => []);
    }

    if (securityId && prices.length > 0) {
      // Split / consolidation since the cache was filled:
      //   - Yahoo has re-based its history, so the cached rows outside this window would sit on the old basis next to re-based ones
      //   - Refetch the security's whole cached span and overwrite it so every row shares one basis
      if (hasAdjustmentMismatch(cachedRows, prices)) {
        const { data: first } = await supabase
          .from('price_history').select('date').eq('security_id', securityId)
          .order('date', { ascending: true }).limit(1);
        const fullFrom = (first?.[0]?.date as string | undefined) ?? fromDate;
        const full = await fetchDailyCloses(ticker, fullFrom < fromDate ? fullFrom : fromDate, toDate, timeZone).catch(() => [] as DailyClose[]);
        if (full.length >= prices.length) {
          console.warn(`price_history: ${ticker} re-based by Yahoo (split/consolidation?); refreshed ${full.length} rows from ${fullFrom}`);
          await savePriceHistory(securityId, full);
          return full.filter((p) => p.date >= fromDate && p.date <= toDate);
        }
      }
      await savePriceHistory(securityId, prices);
    }

    // Merge rather than replace:
    //   - Yahoo can return far less than is cached (delisted, renamed, outage, or a Cboe .XA listing with no daily history that returns only today's live quote, as with IBTC)
    //   - Returning only that would drop every cached close and value the holding at $0 on those days
    //   - Fresh closes win on shared dates
    return dedupeByDate([...cachedRows, ...prices]).sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error(`Failed to fetch prices for ${symbol}:`, err);
    return cachedRows;
  }
}

export async function getBenchmarkPrices(
  indexSymbol: string,
  fromDate: string,
  toDate: string
): Promise<{ date: string; close: number }[]> {
  const { data: cached } = await supabase
    .from('benchmark_data')
    .select('date, close_price')
    .eq('index_symbol', indexSymbol)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true });

  if (cached && cached.length > 5) {
    // Only use cache if it actually covers the requested fromDate.
    // A previous query for a shorter range (e.g. 1Y) may have populated the cache
    // but its earliest row could be months after fromDate — causing the benchmark
    // line to start too late and appear invisible on the chart.
    const firstCached = new Date(cached[0].date as string);
    const reqFrom     = new Date(fromDate);
    const daysDiff    = (firstCached.getTime() - reqFrom.getTime()) / 86_400_000;
    if (daysDiff <= 7) {
      return cached.map((r) => ({ date: r.date as string, close: r.close_price as number }));
    }
    // Cache starts too late — fall through to fresh Yahoo fetch
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(indexSymbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = dedupeByDate(((result.quotes ?? []) as any[])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: quoteDate(q.date as string, result.meta?.exchangeTimezoneName ?? benchmarkTimeZone(indexSymbol)),
        close: q.close as number,
      })));

    if (prices.length > 0) {
      await supabase.from('benchmark_data').upsert(
        prices.map((p) => ({ index_symbol: indexSymbol, date: p.date, close_price: p.close })),
        { onConflict: 'index_symbol,date' }
      );
    }

    return prices;
  } catch (err) {
    console.error(`Failed to fetch benchmark ${indexSymbol}:`, err);
    return [];
  }
}

/**
 * Look up a historical forex exchange rate.
 * Returns how many `toCurrency` units equal 1 `fromCurrency` unit.
 * e.g. getForexRate('USD', 'AUD', '2025-01-15') → 1.58 means 1 USD = 1.58 AUD
 *
 * Strategy:
 *  1. Try Yahoo symbol `{from}{to}=X` directly (e.g. USDAUD=X)
 *  2. If that fails, try the inverse `{to}{from}=X` and invert the rate
 *  3. Fetch a ±5-day window so weekends / market-close days are covered
 *  4. Return the closest rate to `date`; falls back to 1 if nothing found
 */
export async function getForexRate(
  fromCurrency: string,
  toCurrency: string,
  date: string, // YYYY-MM-DD
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;

  // Fetch a ±5-day window to cover weekends and market-close days
  const centre = new Date(date);
  const fromDate = format(new Date(centre.getTime() - 5 * 86_400_000), 'yyyy-MM-dd');
  const toDate   = format(new Date(centre.getTime() + 5 * 86_400_000), 'yyyy-MM-dd');

  const fetchPair = async (symbol: string, invert: boolean): Promise<{ date: string; close: number }[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return dedupeByDate(((result.quotes ?? []) as any[])
      .filter((q) => q.close != null && q.close > 0)
      .map((q) => ({
        date:  quoteDate(q.date as string, result.meta?.exchangeTimezoneName),
        close: invert ? 1 / (q.close as number) : (q.close as number),
      })));
  };

  let prices: { date: string; close: number }[] = [];

  try {
    prices = await fetchPair(`${fromCurrency}${toCurrency}=X`, false);
  } catch {
    try {
      prices = await fetchPair(`${toCurrency}${fromCurrency}=X`, true);
    } catch {
      return 1;
    }
  }

  if (!prices.length) {
    // Try inverse if direct returned empty
    try {
      prices = await fetchPair(`${toCurrency}${fromCurrency}=X`, true);
    } catch { /* ignored */ }
  }

  if (!prices.length) return 1;

  // Return the price closest to the requested date
  const target = new Date(date).getTime();
  return prices.reduce((best, p) => {
    const bd = Math.abs(new Date(best.date).getTime() - target);
    const pd = Math.abs(new Date(p.date).getTime()  - target);
    return pd < bd ? p : best;
  }).close;
}

/** Map common Yahoo quoteType values to human-readable asset type names. */
const QUOTE_TYPE_MAP: Record<string, string> = {
  EQUITY:         'Equity',
  ETF:            'ETF',
  MUTUALFUND:     'Mutual Fund',
  FUTURE:         'Future',
  CURRENCY:       'Currency',
  CRYPTOCURRENCY: 'Crypto',
  INDEX:          'Index',
  OPTION:         'Option',
};

/** Derive country from exchange code when Yahoo doesn't provide it (common for ETFs). */
function countryFromExchange(exchange: string | null | undefined): string | null {
  const e = (exchange ?? '').toUpperCase();
  if (e === 'ASX')                                                       return 'Australia';
  if (['NYSE', 'NASDAQ', 'US', 'BATS', 'ARCA', 'NYSEARCA', 'AMEX'].includes(e)) return 'United States';
  if (e === 'LSE')                                                       return 'United Kingdom';
  if (e === 'TSX')                                                       return 'Canada';
  if (e === 'HK')                                                        return 'Hong Kong';
  if (e === 'SGX')                                                       return 'Singapore';
  return null;
}

/**
 * Fetch sector, country, and asset_type for a security from Yahoo Finance.
 * Uses the assetProfile (sector/country) and quoteType (Equity/ETF/etc.) modules.
 * Falls back gracefully — never throws. Country falls back to the exchange mapping
 * for ETFs and other instruments that have no assetProfile.
 *
 * Results are intended to be persisted to the securities table so subsequent
 * diversity loads skip the Yahoo call entirely.
 */
export async function enrichSecurityMetadata(
  symbol: string,
  exchange?: string | null,
): Promise<{ sector: string | null; country: string | null; asset_type: string | null }> {
  const ticker = toYahooTicker(symbol, exchange);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile', 'quoteType'] });
    const sector     = (result.assetProfile?.sector    as string | null) ?? null;
    const country    = (result.assetProfile?.country   as string | null) ?? countryFromExchange(exchange);
    const qt         = result.quoteType?.quoteType as string | undefined;
    const asset_type = qt ? (QUOTE_TYPE_MAP[qt] ?? (qt.charAt(0).toUpperCase() + qt.slice(1).toLowerCase())) : null;
    return { sector, country, asset_type };
  } catch {
    // Yahoo call failed — still return a country from the exchange mapping
    return { sector: null, country: countryFromExchange(exchange), asset_type: null };
  }
}

export async function getCurrentPrice(symbol: string, exchange?: string | null): Promise<number | null> {
  const tryQuote = async (ticker: string): Promise<number | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await yahooFinance.quoteSummary(ticker, { modules: ['price'] });
      return (result.price?.regularMarketPrice as number) ?? null;
    } catch {
      return null;
    }
  };

  const yahooSym = toYahooTicker(symbol, exchange);
  const price = await tryQuote(yahooSym);
  if (price != null) return price;

  // Some ASX-listed securities (Cboe/Chi-X) use .XA instead of .AX on Yahoo Finance
  if ((exchange ?? '').toUpperCase() === 'ASX') {
    return tryQuote(`${symbol}.XA`);
  }
  return null;
}

/** Fetch current prices for a list of securities.
 *  Returns a map keyed by bare symbol (no exchange suffix). */
export async function getCurrentPrices(
  securities: { symbol: string; exchange: string }[],
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  await Promise.all(
    securities.map(async ({ symbol, exchange }) => {
      const p = await getCurrentPrice(symbol, exchange);
      if (p != null) prices[symbol] = p;
    }),
  );
  return prices;
}
