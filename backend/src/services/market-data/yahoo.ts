import yahooFinance from 'yahoo-finance2';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';

export const BENCHMARKS = {
  ASX200: '^AXJO',
  SP500: '^GSPC',
  NASDAQ: '^IXIC',
} as const;

export async function getHistoricalPrices(
  symbol: string,
  fromDate: string,
  toDate: string,
  securityId?: string
): Promise<{ date: string; close: number }[]> {
  if (securityId) {
    const { data: cached } = await supabase
      .from('price_history')
      .select('date, close_price')
      .eq('security_id', securityId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: true });

    if (cached && cached.length > 5) {
      return cached.map((r) => ({ date: r.date as string, close: r.close_price as number }));
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = ((result.quotes ?? []) as any[])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: format(new Date(q.date as string), 'yyyy-MM-dd'),
        close: q.close as number,
      }));

    if (securityId && prices.length > 0) {
      await supabase.from('price_history').upsert(
        prices.map((p) => ({ security_id: securityId, date: p.date, close_price: p.close })),
        { onConflict: 'security_id,date' }
      );
    }

    return prices;
  } catch (err) {
    console.error(`Failed to fetch prices for ${symbol}:`, err);
    return [];
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
    return cached.map((r) => ({ date: r.date as string, close: r.close_price as number }));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(indexSymbol, {
      period1: fromDate,
      period2: toDate,
      interval: '1d',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prices = ((result.quotes ?? []) as any[])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: format(new Date(q.date as string), 'yyyy-MM-dd'),
        close: q.close as number,
      }));

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
    return ((result.quotes ?? []) as any[])
      .filter((q) => q.close != null && q.close > 0)
      .map((q) => ({
        date:  format(new Date(q.date as string), 'yyyy-MM-dd'),
        close: invert ? 1 / (q.close as number) : (q.close as number),
      }));
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

export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.quoteSummary(symbol, { modules: ['price'] });
    return (result.price?.regularMarketPrice as number) ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      const p = await getCurrentPrice(sym);
      if (p != null) prices[sym] = p;
    })
  );
  return prices;
}
