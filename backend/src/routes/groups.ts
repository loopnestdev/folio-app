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

    const thisYear     = new Date().getFullYear();
    const ytdStartDate = `${thisYear}-01-01`;
    const ytdEndDate   = `${thisYear}-01-10`; // fetch first 10 days to catch first trading day

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
        const secEntries = Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange }));

        // Fetch current prices and YTD-start prices in parallel.
        // YTD-start prices use the first available trading day in Jan so the
        // YTD return reflects actual price movement, not just composition changes.
        const [currentPrices, ytdPriceEntries] = await Promise.all([
          getCurrentPrices(secEntries),
          Promise.all(
            secEntries.map(async ({ symbol, exchange }) => {
              const prices = await getHistoricalPrices(symbol, ytdStartDate, ytdEndDate, undefined, exchange);
              const first = prices[0];
              return [symbol, first?.close ?? null] as [string, number | null];
            }),
          ),
        ]);

        const ytdPrices: Record<string, number> = {};
        for (const [sym, price] of ytdPriceEntries) {
          if (price !== null) ytdPrices[sym] = price;
        }

        const holdings = calculateHoldings(trades as any, currentPrices);

        const fx = fxRates[portfolio.currency] ?? 1;
        const totalValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
        const totalCost  = holdings.reduce((s, h) => s + h.cost_base, 0);
        const totalGain  = totalValue - totalCost;

        // YTD: value of what was held at Jan 1 using Jan 1 prices vs current prices
        const tradesBeforeYTD   = trades.filter(t => t.trade_date < ytdStartDate);
        const holdingsAtYTDStart = calculateHoldings(tradesBeforeYTD as any, ytdPrices);
        const ytdStartValue      = holdingsAtYTDStart.reduce((s, h) => s + (h.market_value ?? 0), 0);
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
// Consolidated TWR chart. Each portfolio's daily value (holdings + cash) is
// converted to base_currency and summed. External cash flows (deposits &
// withdrawals) from all sub-portfolios are summed the same way. Because FX
// transfers appear as an AUD withdrawal AND a USD deposit, they cancel out
// in the combined flow sum — which is exactly right (money didn't leave the group).
// The TWR chain is then applied to the combined series, identical to the
// individual portfolio implementation in reports.ts.
router.get('/:id/performance', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  // The frontend computes the date window from the selected range and sends
  // start_date / end_date directly (via dateRangeToParams in utils.ts).
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? todayStr;
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) { res.json([]); return; }

    // Current forex rates for non-base currencies
    const today = format(new Date(), 'yyyy-MM-dd');
    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(
      uniqueCurrencies.map(async (cur) => {
        fxRates[cur] = await getForexRate(cur, baseCurrency, today);
      }),
    );

    // Benchmarks — fetched in parallel with portfolio data below
    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500,  fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, fromDate, toDate),
    ]);

    // ── Per-portfolio daily series ─────────────────────────────────────────
    // Each entry in `portfolioDateMaps` is a Record<date, {totalValue, extFlow, netDep}>
    // all amounts are already in base_currency (multiplied by fx).
    type DayEntry = { totalValue: number; extFlow: number; netDep: number };
    const portfolioDateMaps: Array<Record<string, DayEntry>> = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) return {};

        const fx = fxRates[portfolio.currency] ?? 1;
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

        const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

        // Running cash balance at each trade event
        let cash = 0;
        const cashEvents: [string, number][] = sortedTrades.map((t) => {
          if      (t.trade_type === 'deposit')    cash += t.price * t.quantity;
          else if (t.trade_type === 'withdrawal') cash -= t.price * t.quantity;
          else if (t.trade_type === 'buy')        cash -= t.price * t.quantity + t.brokerage;
          else if (t.trade_type === 'sell')       cash += t.price * t.quantity - t.brokerage;
          else if (t.trade_type === 'dividend')   cash += t.price * t.quantity;
          return [t.trade_date, cash] as [string, number];
        });
        const getCashAt = (date: string): number => {
          let val = 0;
          for (const [d, c] of cashEvents) { if (d <= date) val = c; else break; }
          return val;
        };

        // External flows on each date (for TWR denominator adjustment)
        const extFlowByDate: Record<string, number> = {};
        for (const t of sortedTrades) {
          if (t.trade_type === 'deposit') {
            extFlowByDate[t.trade_date] = (extFlowByDate[t.trade_date] ?? 0) + t.price * t.quantity;
          } else if (t.trade_type === 'withdrawal') {
            extFlowByDate[t.trade_date] = (extFlowByDate[t.trade_date] ?? 0) - t.price * t.quantity;
          } else if (t.trade_type === 'buy' && t.price === 0 && t.security) {
            // Transfer-In: treat as external inflow at market price
            const mktPrice = priceMap[t.trade_date]?.[t.security.symbol] ?? 0;
            extFlowByDate[t.trade_date] = (extFlowByDate[t.trade_date] ?? 0) + mktPrice * t.quantity;
          }
        }

        // Running net deposited (deposits minus withdrawals only)
        let netDep = 0;
        const netDepEvents: [string, number][] = sortedTrades.map((t) => {
          if      (t.trade_type === 'deposit')    netDep += t.price * t.quantity;
          else if (t.trade_type === 'withdrawal') netDep -= t.price * t.quantity;
          return [t.trade_date, netDep] as [string, number];
        });
        const getNetDepAt = (date: string): number => {
          let val = 0;
          for (const [d, n] of netDepEvents) { if (d <= date) val = n; else break; }
          return val;
        };

        // Build per-date map
        const dateMap: Record<string, DayEntry> = {};
        for (const date of Object.keys(priceMap).sort()) {
          const dayHoldings = calculateHoldings(
            trades.filter((t) => t.trade_date <= date) as any,
            priceMap[date],
          );
          const holdingsValue = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
          dateMap[date] = {
            totalValue: (holdingsValue + getCashAt(date)) * fx,
            extFlow:    (extFlowByDate[date] ?? 0) * fx,
            netDep:     getNetDepAt(date) * fx,
          };
        }
        return dateMap;
      }),
    );

    // ── Aggregate across portfolios ────────────────────────────────────────
    const allDates = [...new Set(portfolioDateMaps.flatMap((m) => Object.keys(m)))].sort();
    if (!allDates.length) { res.json([]); return; }

    // Carry-forward portfolio value and netDep (they persist between dates);
    // extFlow is only counted on the date it actually occurred (no carry-forward).
    const lastKnownValue  = portfolioDateMaps.map(() => 0);
    const lastKnownNetDep = portfolioDateMaps.map(() => 0);

    const combined: { date: string; totalValue: number; extFlow: number; netDep: number }[] = [];
    for (const date of allDates) {
      let totalValue = 0, totalExtFlow = 0, totalNetDep = 0;
      for (let i = 0; i < portfolioDateMaps.length; i++) {
        const entry = portfolioDateMaps[i][date];
        if (entry !== undefined) {
          lastKnownValue[i]  = entry.totalValue;
          lastKnownNetDep[i] = entry.netDep;
          totalExtFlow += entry.extFlow;   // only on its actual date
        }
        totalValue  += lastKnownValue[i];
        totalNetDep += lastKnownNetDep[i];
      }
      combined.push({ date, totalValue, extFlow: totalExtFlow, netDep: totalNetDep });
    }

    // ── TWR chain ─────────────────────────────────────────────────────────
    // Start from first date where BOTH group netDep > 0 AND totalValue > 0.
    // Same logic as individual portfolio: avoids division by zero or inverted
    // factors when the portfolio crosses zero.
    const startIdx = combined.findIndex((d) => d.netDep > 0 && d.totalValue > 0);
    if (startIdx === -1) { res.json([]); return; }
    const chartStartDate = combined[startIdx].date;

    let multiplier = 1.0;
    let prevValue  = combined[startIdx].totalValue;

    const portfolioGain: { date: string; value: number | null }[] = [
      { date: chartStartDate, value: 0.0 },
    ];

    for (let i = startIdx + 1; i < combined.length; i++) {
      const { date, totalValue, extFlow } = combined[i];
      const adjustedBase = prevValue + extFlow;
      if (adjustedBase > 0 && totalValue > 0) {
        multiplier *= totalValue / adjustedBase;
        portfolioGain.push({ date, value: (multiplier - 1) * 100 });
        prevValue = totalValue;
      } else {
        portfolioGain.push({ date, value: null });
      }
    }

    // ── Benchmarks ────────────────────────────────────────────────────────
    // Build 0-based % gain maps from chartStartDate, then forward-fill so that
    // ASX trading days (which have no US market price) still get a benchmark value.
    const benchMap = (arr: { date: string; close: number }[], fromDate: string): Record<string, number> => {
      const slice = arr.filter((d) => d.date >= fromDate);
      if (!slice.length) return {};
      const base = slice[0].close;
      // Raw map: only trading days that Yahoo returned
      const raw: Record<string, number> = {};
      for (const d of slice) raw[d.date] = base > 0 ? (d.close / base - 1) * 100 : 0;
      // Forward-fill across portfolio dates so gaps (e.g. ASX vs NYSE) are bridged
      let last: number | null = null;
      const filled: Record<string, number> = {};
      for (const date of allDates) {
        if (raw[date] !== undefined) last = raw[date];
        if (last !== null) filled[date] = last;
      }
      return filled;
    };

    const sp500Map  = benchMap(sp500,  chartStartDate);
    const nasdaqMap = benchMap(nasdaq, chartStartDate);
    const asx200Map = benchMap(asx200, chartStartDate);

    const result = portfolioGain.map((d) => ({
      date:             d.date,
      portfolio_value:  d.value,
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
