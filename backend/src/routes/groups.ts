import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCapitalGains } from '../services/calculations/holdings';
import {
  getHistoricalPrices, getBenchmarkPrices, getCurrentPrices, BENCHMARKS,
} from '../services/market-data/yahoo';
import { getForexRate } from '../services/market-data/yahoo';
import { format, subYears, startOfYear } from 'date-fns';
import type { AuthenticatedRequest, Trade } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);

router.use(use(authMiddleware), use(requireApproved));

// ── Schema ────────────────────────────────────────────────────
const groupSchema = z.object({
  name:          z.string().min(1, 'Name is required').max(100),
  description:   z.string().max(500).optional().nullable(),
  base_currency: z.string().length(3).default('AUD'),
});

// ── Helpers ───────────────────────────────────────────────────
/** Verify the group belongs to this user and return it. */
async function getGroup(groupId: string, userId: string) {
  const { data } = await supabase
    .from('portfolio_groups')
    .select('*')
    .eq('id', groupId)
    .eq('user_id', userId)
    .single();
  return data;
}

/** All portfolios that belong to a group. */
async function getGroupPortfolios(groupId: string, userId: string) {
  const { data } = await supabase
    .from('portfolios')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId);
  return data ?? [];
}

/** All trades for a portfolio, ordered by date. */
async function getPortfolioTrades(portfolioId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*, security:securities(*)')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Trade[];
}

function getDateRange(range: string, from?: string, to?: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const y = new Date().getFullYear();
  switch (range) {
    case 'YTD':    return { fromDate: `${y}-01-01`, toDate: today };
    case '1Y':     return { fromDate: format(subYears(new Date(), 1), 'yyyy-MM-dd'), toDate: today };
    case '2Y':     return { fromDate: format(subYears(new Date(), 2), 'yyyy-MM-dd'), toDate: today };
    case '3Y':     return { fromDate: format(subYears(new Date(), 3), 'yyyy-MM-dd'), toDate: today };
    case '5Y':     return { fromDate: format(subYears(new Date(), 5), 'yyyy-MM-dd'), toDate: today };
    case 'custom': return { fromDate: from ?? `${y}-01-01`, toDate: to ?? today };
    default:       return { fromDate: '2000-01-01', toDate: today };
  }
}

// ═════════════════════════════════════════════════════════════
//  CRUD
// ═════════════════════════════════════════════════════════════

// GET /api/groups
router.get('/', async (req: AuthenticatedRequest, res: any) => {
  try {
    const [{ data: groups, error: ge }, { data: portfolios, error: pe }] = await Promise.all([
      supabase
        .from('portfolio_groups')
        .select('*')
        .eq('user_id', req.userId!)
        .order('created_at', { ascending: true }),
      supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', req.userId!)
        .order('created_at', { ascending: true }),
    ]);
    if (ge) { res.status(500).json({ error: ge.message }); return; }
    if (pe) { res.status(500).json({ error: pe.message }); return; }

    const result = (groups ?? []).map((g) => ({
      ...g,
      portfolios: (portfolios ?? []).filter((p) => p.group_id === g.id),
    }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups
router.post('/', async (req: AuthenticatedRequest, res: any) => {
  const body = groupSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('portfolio_groups')
    .insert({ ...body.data, user_id: req.userId! })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ ...data, portfolios: [] });
});

// PATCH /api/groups/:id
router.patch('/:id', async (req: AuthenticatedRequest, res: any) => {
  const body = groupSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('portfolio_groups')
    .update(body.data)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Group not found' }); return; }
  res.json(data);
});

// DELETE /api/groups/:id — portfolios' group_id set to NULL via FK ON DELETE SET NULL
router.delete('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { error } = await supabase
    .from('portfolio_groups')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ═════════════════════════════════════════════════════════════
//  GROUP REPORTS
// ═════════════════════════════════════════════════════════════

// ── GET /api/groups/:id/summary ───────────────────────────────
// Consolidated NAV, return, and per-portfolio breakdown in base_currency.
router.get('/:id/summary', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) {
      res.json({
        base_currency: baseCurrency,
        total_value: 0, total_cost: 0, total_gain: 0, total_gain_pct: 0,
        ytd_return: 0, ytd_return_pct: 0,
        portfolios: [],
      });
      return;
    }

    // Fetch forex rates for all unique non-base currencies (single call each)
    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const today = format(new Date(), 'yyyy-MM-dd');
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(
      uniqueCurrencies.map(async (cur) => {
        fxRates[cur] = await getForexRate(cur, baseCurrency, today);
      }),
    );

    const ytdStartDate = format(startOfYear(new Date()), 'yyyy-MM-dd');

    const portfolioBreakdowns = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) {
          return {
            id: portfolio.id, name: portfolio.name,
            currency: portfolio.currency, fx_rate: fxRates[portfolio.currency] ?? 1,
            total_value: 0, total_value_base: 0,
            total_cost: 0, total_cost_base: 0,
            total_gain: 0, total_gain_base: 0,
            ytd_return: 0, ytd_return_base: 0,
          };
        }

        const securitiesMap = new Map<string, string>();
        trades.filter(t => t.security).forEach(t => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
        const currentPrices = await getCurrentPrices(Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })));
        const holdings = calculateHoldings(trades as any, currentPrices);

        const fx = fxRates[portfolio.currency] ?? 1;
        const totalValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
        const totalCost  = holdings.reduce((s, h) => s + h.cost_base, 0);
        const totalGain  = totalValue - totalCost;

        const tradesBeforeYTD = trades.filter(t => t.trade_date < ytdStartDate);
        const holdingsYTD = calculateHoldings(tradesBeforeYTD as any, currentPrices);
        const ytdStartValue = holdingsYTD.reduce((s, h) => s + (h.market_value ?? 0), 0);
        const ytdReturn = totalValue - ytdStartValue;

        return {
          id: portfolio.id, name: portfolio.name,
          currency: portfolio.currency, fx_rate: fx,
          total_value: totalValue,       total_value_base: totalValue * fx,
          total_cost:  totalCost,        total_cost_base:  totalCost  * fx,
          total_gain:  totalGain,        total_gain_base:  totalGain  * fx,
          ytd_return:  ytdReturn,        ytd_return_base:  ytdReturn  * fx,
        };
      }),
    );

    const totalValue = portfolioBreakdowns.reduce((s, p) => s + p.total_value_base, 0);
    const totalCost  = portfolioBreakdowns.reduce((s, p) => s + p.total_cost_base, 0);
    const totalGain  = portfolioBreakdowns.reduce((s, p) => s + p.total_gain_base, 0);
    const ytdReturn  = portfolioBreakdowns.reduce((s, p) => s + p.ytd_return_base, 0);
    const ytdStartValue = portfolioBreakdowns.reduce((s, p) => s + (p.total_value_base - p.ytd_return_base), 0);

    res.json({
      base_currency: baseCurrency,
      total_value:    totalValue,
      total_cost:     totalCost,
      total_gain:     totalGain,
      total_gain_pct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
      ytd_return:     ytdReturn,
      ytd_return_pct: ytdStartValue > 0 ? (ytdReturn / ytdStartValue) * 100 : 0,
      portfolios: portfolioBreakdowns,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/performance ──────────────────────────
// Consolidated performance chart — each portfolio's values are converted to
// base_currency using the current forex rate, then summed and normalised to 100.
router.get('/:id/performance', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const { range = 'ALL', from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getDateRange(range, from, to);
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) { res.json([]); return; }

    // Forex rates (current) for non-base currencies
    const today = format(new Date(), 'yyyy-MM-dd');
    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(
      uniqueCurrencies.map(async (cur) => {
        fxRates[cur] = await getForexRate(cur, baseCurrency, today);
      }),
    );

    // Benchmarks (shared across all portfolios in the group)
    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, fromDate, toDate),
    ]);

    // Compute raw daily values for each portfolio in base_currency
    const portfolioValueSeries: Array<Record<string, number>> = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) return {};

        const symbols = [...new Set(trades.filter(t => t.security).map(t => t.security!.symbol))];
        const pricesBySymbol = await Promise.all(
          symbols.map(async (sym) => {
            const sec = trades.find(t => t.security?.symbol === sym)?.security;
            const prices = await getHistoricalPrices(sym, fromDate, toDate, sec?.id);
            return { symbol: sym, prices };
          }),
        );

        const priceMap: Record<string, Record<string, number>> = {};
        for (const { symbol, prices } of pricesBySymbol) {
          for (const { date, close } of prices) {
            if (!priceMap[date]) priceMap[date] = {};
            priceMap[date][symbol] = close;
          }
        }

        const fx = fxRates[portfolio.currency] ?? 1;
        const dateValues: Record<string, number> = {};
        for (const date of Object.keys(priceMap).sort()) {
          const value = calculateHoldings(
            trades.filter(t => t.trade_date <= date) as any,
            priceMap[date],
          ).reduce((s, h) => s + (h.market_value ?? 0), 0);
          dateValues[date] = value * fx; // converted to base_currency
        }
        return dateValues;
      }),
    );

    // Union of all dates across all portfolios
    const allDates = [...new Set(portfolioValueSeries.flatMap((s) => Object.keys(s)))].sort();
    if (!allDates.length) { res.json([]); return; }

    // Sum portfolio values at each date (carry-forward for missing dates)
    const combined: { date: string; value: number }[] = [];
    const lastKnown = portfolioValueSeries.map(() => 0);
    for (const date of allDates) {
      let total = 0;
      for (let i = 0; i < portfolioValueSeries.length; i++) {
        if (portfolioValueSeries[i][date] !== undefined) {
          lastKnown[i] = portfolioValueSeries[i][date];
        }
        total += lastKnown[i];
      }
      combined.push({ date, value: total });
    }

    // Normalise to base 100
    const baseValue = combined[0].value;
    const normalised = combined.map((d) => ({
      date: d.date,
      portfolio_value: baseValue > 0 ? (d.value / baseValue) * 100 : 100,
    }));

    // Attach benchmarks
    const normalise = (arr: { date: string; close: number }[]) => {
      if (!arr.length) return {} as Record<string, number>;
      const base = arr[0].close;
      return Object.fromEntries(arr.map((d) => [d.date, base > 0 ? (d.close / base) * 100 : 100]));
    };
    const sp500Map  = normalise(sp500);
    const nasdaqMap = normalise(nasdaq);
    const asx200Map = normalise(asx200);

    const result = normalised.map((d) => ({
      date:             d.date,
      portfolio_value:  d.portfolio_value,
      benchmark_sp500:  sp500Map[d.date]  ?? null,
      benchmark_nasdaq: nasdaqMap[d.date] ?? null,
      benchmark_asx200: asx200Map[d.date] ?? null,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/capital-gains ────────────────────────
// Combined CGT across all portfolios. Values are already in each portfolio's
// currency with exchange_rate applied, so cost_base and proceeds are AUD-equivalent.
router.get('/:id/capital-gains', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const schema = z.object({
    fyStart: z.enum(['january', 'july']).default('july'),
    year:    z.string().regex(/^\d{4}$/).default(String(new Date().getFullYear())),
  });
  const params = schema.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.flatten() }); return; }

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    const allGains: any[] = [];

    await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) return;
        const lots = calculateCapitalGains(trades as any, params.data.fyStart, parseInt(params.data.year));
        for (const lot of lots) {
          allGains.push({
            ...lot,
            // Map backend CgtLot fields to frontend CapitalGain shape
            is_long_term:           lot.hold_days >= 365,
            hold_period_days:       lot.hold_days,
            cgt_discount_applicable: lot.cgt_discount_eligible,
            cgt_discount_pct:       50,
            portfolio_id:           portfolio.id,
            portfolio_name:         portfolio.name,
            portfolio_currency:     portfolio.currency,
          });
        }
      }),
    );

    // Sort by sell_date descending
    allGains.sort((a, b) => b.sell_date.localeCompare(a.sell_date));
    res.json(allGains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/tax ───────────────────────────────────
// Consolidated tax report across all portfolios, expressed in base_currency.
router.get('/:id/tax', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const schema = z.object({
    fyStart: z.enum(['january', 'july']).default('july'),
    year:    z.string().regex(/^\d{4}$/).default(String(new Date().getFullYear())),
  });
  const params = schema.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.flatten() }); return; }

  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) {
      res.json({
        financial_year: params.data.year,
        base_currency: baseCurrency,
        dividends_received: 0, interest_received: 0,
        capital_gains_short_term: 0, capital_gains_long_term: 0,
        cgt_discount_applied: 0, total_taxable_income: 0,
        portfolios: [],
      });
      return;
    }

    // Fetch current forex rates for non-base currencies
    const today = format(new Date(), 'yyyy-MM-dd');
    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(
      uniqueCurrencies.map(async (cur) => {
        fxRates[cur] = await getForexRate(cur, baseCurrency, today);
      }),
    );

    const { fyStart, year } = params.data;
    const yearNum = parseInt(year);
    const fyStartDate = fyStart === 'july' ? `${yearNum - 1}-07-01` : `${yearNum}-01-01`;
    const fyEndDate   = fyStart === 'july' ? `${yearNum}-06-30`     : `${yearNum}-12-31`;

    const portfolioTaxData = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        const fx = fxRates[portfolio.currency] ?? 1;
        const fyTrades = trades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);

        // Income (already in trade currency; multiply by exchange_rate stored on each trade for AUD base)
        // For simplicity, use current fx rate here (same as individual portfolio tax endpoint)
        const dividends = fyTrades.filter(t => t.trade_type === 'dividend');
        const interest  = fyTrades.filter(t => t.trade_type === 'interest');
        const dividendIncome = dividends.reduce((s, t) => s + (t.price * t.quantity) * fx, 0);
        const interestIncome = interest.reduce((s, t) => s + (t.price * t.quantity) * fx, 0);

        // CGT (cost_base and proceeds already AUD-equivalent via trade exchange_rate)
        const lots = calculateCapitalGains(trades as any, fyStart, yearNum);
        const shortTerm = lots.filter(l => l.hold_days < 365).reduce((s, l) => s + l.net_gain, 0) * fx;
        const longTerm  = lots.filter(l => l.hold_days >= 365).reduce((s, l) => s + l.net_gain, 0) * fx;
        const discount  = lots.filter(l => l.cgt_discount_eligible)
          .reduce((s, l) => s + l.cgt_discount_amount, 0) * fx;

        return {
          portfolio_id:     portfolio.id,
          portfolio_name:   portfolio.name,
          portfolio_currency: portfolio.currency,
          fx_rate:          fx,
          dividends_received:         dividendIncome,
          interest_received:          interestIncome,
          capital_gains_short_term:   shortTerm,
          capital_gains_long_term:    longTerm,
          cgt_discount_applied:       discount,
          total_taxable_income:       dividendIncome + interestIncome + shortTerm + longTerm - discount,
        };
      }),
    );

    const sum = (key: keyof typeof portfolioTaxData[0]) =>
      portfolioTaxData.reduce((s, p) => s + (p[key] as number), 0);

    res.json({
      financial_year: fyStart === 'july' ? `${yearNum - 1}–${yearNum}` : String(yearNum),
      base_currency: baseCurrency,
      dividends_received:       sum('dividends_received'),
      interest_received:        sum('interest_received'),
      capital_gains_short_term: sum('capital_gains_short_term'),
      capital_gains_long_term:  sum('capital_gains_long_term'),
      cgt_discount_applied:     sum('cgt_discount_applied'),
      total_taxable_income:     sum('total_taxable_income'),
      portfolios: portfolioTaxData,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
