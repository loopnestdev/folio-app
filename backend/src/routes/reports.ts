import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCapitalGains } from '../services/calculations/holdings';
import { computeStatistics, computeMonthlyReturns } from '../services/calculations/statistics';
import { getHistoricalPrices, getBenchmarkPrices, getCurrentPrices, BENCHMARKS } from '../services/market-data/yahoo';
import { format, subYears, startOfYear } from 'date-fns';
import type { AuthenticatedRequest, Trade } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

async function verifyOwner(portfolioId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('portfolios').select('id').eq('id', portfolioId).eq('user_id', userId).single();
  return !!data;
}

async function getPortfolioTrades(portfolioId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select('*, security:securities(*)')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Trade[];
}

function getDateRange(range: string, from?: string, to?: string): { fromDate: string; toDate: string } {
  const today = format(new Date(), 'yyyy-MM-dd');
  const thisYear = new Date().getFullYear();

  switch (range) {
    case 'YTD':
      return { fromDate: `${thisYear}-01-01`, toDate: today };
    case '1Y':
      return { fromDate: format(subYears(new Date(), 1), 'yyyy-MM-dd'), toDate: today };
    case '2Y':
      return { fromDate: format(subYears(new Date(), 2), 'yyyy-MM-dd'), toDate: today };
    case '3Y':
      return { fromDate: format(subYears(new Date(), 3), 'yyyy-MM-dd'), toDate: today };
    case '5Y':
      return { fromDate: format(subYears(new Date(), 5), 'yyyy-MM-dd'), toDate: today };
    case 'custom':
      return { fromDate: from ?? `${thisYear}-01-01`, toDate: to ?? today };
    default: // ALL
      return { fromDate: '2000-01-01', toDate: today };
  }
}

// GET /api/portfolios/:id/holdings
router.get('/:id/holdings', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  try {
    const trades = await getPortfolioTrades(id);
    const securitiesMap = new Map<string, string>();
    trades.filter(t => t.security).forEach(t => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
    const currentPrices = await getCurrentPrices(Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })));
    const rawHoldings = calculateHoldings(trades as any, currentPrices);
    // Map cost_base → total_cost to match the frontend Holding interface
    const holdings = rawHoldings.map((h) => ({ ...h, total_cost: h.cost_base }));

    // Only include holdings with a known price in the gain totals to avoid
    // distorting the summary when Yahoo Finance has no data for a security.
    const pricedHoldings = holdings.filter((h) => h.market_value != null);
    const totalValue = pricedHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const totalCost  = pricedHoldings.reduce((s, h) => s + (h.total_cost ?? 0), 0);
    const totalGain  = totalValue - totalCost;

    res.json({ holdings, summary: { total_value: totalValue, total_cost: totalCost, total_gain: totalGain, total_gain_pct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0 } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/summary
router.get('/:id/summary', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  try {
    const trades = await getPortfolioTrades(id);

    if (!trades.length) {
      res.json({ total_value: 0, total_cost: 0, total_gain: 0, total_gain_pct: 0, cash_balance: 0, ytd_return: 0, ytd_return_pct: 0 });
      return;
    }

    const securitiesMap = new Map<string, string>();
    trades.filter(t => t.security).forEach(t => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
    const currentPrices = await getCurrentPrices(Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })));
    const holdings = calculateHoldings(trades as any, currentPrices);

    const totalValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const totalCost  = holdings.reduce((s, h) => s + h.cost_base, 0);
    const totalGain  = totalValue - totalCost;

    // YTD: compare current value against portfolio value at the start of this year
    const ytdStartDate = format(startOfYear(new Date()), 'yyyy-MM-dd');
    const tradesBeforeYTD = trades.filter(t => t.trade_date < ytdStartDate);
    const holdingsAtYTDStart = calculateHoldings(tradesBeforeYTD as any, currentPrices);
    const valueAtYTDStart = holdingsAtYTDStart.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const ytdReturn = totalValue - valueAtYTDStart;

    res.json({
      total_value:    totalValue,
      total_cost:     totalCost,
      total_gain:     totalGain,
      total_gain_pct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
      cash_balance:   0, // placeholder — deposit/withdrawal tracking not yet implemented
      ytd_return:     ytdReturn,
      ytd_return_pct: valueAtYTDStart > 0 ? (ytdReturn / valueAtYTDStart) * 100 : 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/performance
router.get('/:id/performance', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { range = 'ALL', from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getDateRange(range, from, to);

  try {
    const trades = await getPortfolioTrades(id);
    // Empty portfolio — return empty array so the chart renders the "no data" state
    if (!trades.length) { res.json([]); return; }

    const symbols = [...new Set(trades.filter(t => t.security).map(t => t.security!.symbol))];

    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, fromDate, toDate),
    ]);

    // Build daily portfolio value
    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find(t => t.security?.symbol === sym)?.security;
        const prices = await getHistoricalPrices(sym, fromDate, toDate, sec?.id, sec?.exchange);
        return { symbol: sym, prices };
      })
    );

    const priceMap: Record<string, Record<string, number>> = {};
    for (const { symbol, prices } of pricesBySymbol) {
      for (const { date, close } of prices) {
        if (!priceMap[date]) priceMap[date] = {};
        priceMap[date][symbol] = close;
      }
    }

    const portfolioValues = Object.keys(priceMap).sort().map((date) => {
      const dayPrices = priceMap[date];
      const dayHoldings = calculateHoldings(
        trades.filter(t => t.trade_date <= date) as any,
        dayPrices
      );
      const value = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
      return { date, value };
    });

    // Normalize to base 100 for comparison — all series start at 100
    const normalize = (arr: { date: string; close?: number; value?: number }[], key: 'close' | 'value') => {
      if (!arr.length) return [];
      const base = (arr[0] as any)[key] as number;
      return arr.map(d => ({ date: d.date, value: base > 0 ? (((d as any)[key] as number) / base) * 100 : 100 }));
    };

    const normPortfolio = normalize(portfolioValues, 'value');
    const normSP500    = normalize(sp500, 'close');
    const normNASDAQ   = normalize(nasdaq, 'close');
    const normASX200   = normalize(asx200, 'close');

    // Build lookup maps so we can join benchmarks onto each portfolio date
    const sp500Map:  Record<string, number> = Object.fromEntries(normSP500.map(d => [d.date, d.value]));
    const nasdaqMap: Record<string, number> = Object.fromEntries(normNASDAQ.map(d => [d.date, d.value]));
    const asx200Map: Record<string, number> = Object.fromEntries(normASX200.map(d => [d.date, d.value]));

    // Return flat array — one entry per trading day — matching PerformancePoint type
    const merged = normPortfolio.map(d => ({
      date:              d.date,
      portfolio_value:   d.value,
      benchmark_sp500:   sp500Map[d.date]  ?? null,
      benchmark_nasdaq:  nasdaqMap[d.date] ?? null,
      benchmark_asx200:  asx200Map[d.date] ?? null,
    }));

    res.json(merged);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/statistics
router.get('/:id/statistics', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { range = 'ALL', from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getDateRange(range, from, to);

  try {
    const trades = await getPortfolioTrades(id);
    const symbols = [...new Set(trades.filter(t => t.security).map(t => t.security!.symbol))];

    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find(t => t.security?.symbol === sym)?.security;
        return { symbol: sym, prices: await getHistoricalPrices(sym, fromDate, toDate, sec?.id, sec?.exchange) };
      })
    );

    const priceMap: Record<string, Record<string, number>> = {};
    for (const { symbol, prices } of pricesBySymbol) {
      for (const { date, close } of prices) {
        if (!priceMap[date]) priceMap[date] = {};
        priceMap[date][symbol] = close;
      }
    }

    const portfolioValues = Object.keys(priceMap).sort().map((date) => ({
      date,
      value: calculateHoldings(trades.filter(t => t.trade_date <= date) as any, priceMap[date]).reduce((s, h) => s + (h.market_value ?? 0), 0),
    }));

    const portfolioReturns = computeMonthlyReturns(portfolioValues);

    const [asx200, sp500] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500, fromDate, toDate),
    ]);

    const benchReturns = computeMonthlyReturns(asx200.map(d => ({ date: d.date, value: d.close })));
    const sp500Returns = computeMonthlyReturns(sp500.map(d => ({ date: d.date, value: d.close })));

    const stats = computeStatistics(portfolioReturns, benchReturns, sp500Returns);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/capital-gains
router.get('/:id/capital-gains', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const schema = z.object({
    fyStart: z.enum(['january', 'july']).default('july'),
    year: z.string().regex(/^\d{4}$/).default(String(new Date().getFullYear())),
  });

  const params = schema.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.flatten() }); return; }

  try {
    const trades = await getPortfolioTrades(id);
    const lots = calculateCapitalGains(trades as any, params.data.fyStart, parseInt(params.data.year));

    const totalGrossGain = lots.reduce((s, l) => s + l.gross_gain, 0);
    const totalDiscount = lots.reduce((s, l) => s + l.cgt_discount_amount, 0);
    const totalNetGain = lots.reduce((s, l) => s + l.net_gain, 0);

    res.json({ lots, summary: { total_gross_gain: totalGrossGain, total_cgt_discount: totalDiscount, total_net_gain: totalNetGain } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/tax
router.get('/:id/tax', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const schema = z.object({
    fyStart: z.enum(['january', 'july']).default('july'),
    year: z.string().regex(/^\d{4}$/).default(String(new Date().getFullYear())),
  });

  const params = schema.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.flatten() }); return; }

  const { fyStart, year } = params.data;
  const yearNum = parseInt(year);
  const fyStartDate = fyStart === 'july' ? `${yearNum - 1}-07-01` : `${yearNum}-01-01`;
  const fyEndDate = fyStart === 'july' ? `${yearNum}-06-30` : `${yearNum}-12-31`;

  try {
    const trades = await getPortfolioTrades(id);
    const fyTrades = trades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);

    const dividends = fyTrades.filter(t => t.trade_type === 'dividend');
    const interest = fyTrades.filter(t => t.trade_type === 'interest');

    const totalDividends = dividends.reduce((s, t) => s + t.price * t.quantity, 0);
    const totalInterest = interest.reduce((s, t) => s + t.price * t.quantity, 0);

    const cgtLots = calculateCapitalGains(trades as any, fyStart, yearNum);
    const totalNetCapitalGain = cgtLots.reduce((s, l) => s + l.net_gain, 0);
    const totalTaxableIncome = totalDividends + totalInterest + Math.max(0, totalNetCapitalGain);

    res.json({
      fy_start: fyStartDate,
      fy_end: fyEndDate,
      dividends: { items: dividends, total: totalDividends },
      interest: { items: interest, total: totalInterest },
      capital_gains: { lots: cgtLots, net_total: totalNetCapitalGain },
      total_taxable_income: totalTaxableIncome,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/dividends
router.get('/:id/dividends', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { from, to } = req.query as Record<string, string>;

  let query = supabase
    .from('trades')
    .select('*, security:securities(*)')
    .eq('portfolio_id', id)
    .in('trade_type', ['dividend', 'interest'])
    .order('trade_date', { ascending: false });

  if (from) query = query.gte('trade_date', from);
  if (to) query = query.lte('trade_date', to);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const total = (data ?? []).reduce((s: number, t: any) => s + (t.price as number) * (t.quantity as number), 0);
  res.json({ items: data, total });
});

// GET /api/portfolios/:id/diversity
router.get('/:id/diversity', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  try {
    const trades = await getPortfolioTrades(id);
    const securitiesMap = new Map<string, string>();
    trades.filter(t => t.security).forEach(t => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
    const currentPrices = await getCurrentPrices(Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })));
    const holdings = calculateHoldings(trades as any, currentPrices);

    // Group by exchange (as proxy for country/market)
    const byExchange: Record<string, number> = {};
    const byCurrency: Record<string, number> = {};

    for (const h of holdings) {
      if ((h.market_value ?? 0) <= 0) continue;
      byExchange[h.exchange || 'Unknown'] = (byExchange[h.exchange || 'Unknown'] ?? 0) + (h.market_value ?? 0);
      byCurrency[h.currency] = (byCurrency[h.currency] ?? 0) + (h.market_value ?? 0);
    }

    const total = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const toSlices = (obj: Record<string, number>) =>
      Object.entries(obj).map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);

    res.json({
      by_exchange: toSlices(byExchange),
      by_currency: toSlices(byCurrency),
      by_holding: holdings.map(h => ({
        symbol: h.symbol,
        name: h.security_name,
        value: h.market_value ?? 0,
        pct: total > 0 ? ((h.market_value ?? 0) / total) * 100 : 0,
      })),
      total,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/benchmarks
router.get('/:id/benchmarks', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { range = '1Y', from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getDateRange(range, from, to);

  try {
    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, fromDate, toDate),
    ]);

    res.json({ asx200, sp500, nasdaq });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
