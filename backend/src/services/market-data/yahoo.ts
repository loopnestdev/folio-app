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
