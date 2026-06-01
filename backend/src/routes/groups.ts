import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCapitalGains, calculateCashPosition } from '../services/calculations/holdings';
import { computeStatistics, computeMonthlyReturns } from '../services/calculations/statistics';
import {
  getHistoricalPrices, getBenchmarkPrices, getCurrentPrices, BENCHMARKS,
  getForexRate, enrichSecurityMetadata,
} from '../services/market-data/yahoo';
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
        const { cash_balance } = calculateCashPosition(trades as any);

        const fx = fxRates[portfolio.currency] ?? 1;
        // totalValue = stock market values + cash balance (mirrors individual portfolio logic)
        const investedValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
        const totalValue = investedValue + cash_balance;
        const totalCost  = holdings.reduce((s, h) => s + h.cost_base, 0);
        const totalGain  = investedValue - totalCost;   // unrealised gain on stocks only

        // YTD: compare current total value (stocks + cash) against portfolio value at Jan 1,
        // also including the cash balance at that point. This prevents large selloffs from
        // appearing as losses simply because the cash proceeds aren't counted.
        const tradesBeforeYTD   = trades.filter(t => t.trade_date < ytdStartDate);
        const holdingsAtYTDStart = calculateHoldings(tradesBeforeYTD as any, ytdPrices);
        const { cash_balance: cashAtYTDStart } = calculateCashPosition(tradesBeforeYTD as any);
        const ytdStartValue = holdingsAtYTDStart.reduce((s, h) => s + (h.market_value ?? 0), 0) + cashAtYTDStart;
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

    // ── Per-portfolio daily series ─────────────────────────────────────────
    // Each entry in `portfolioDateMaps` is a Record<date, {totalValue, extFlow, netDep}>
    // all amounts are already in base_currency (multiplied by fx).
    //
    // Price history is fetched from each portfolio's EARLIEST TRADE DATE (not fromDate)
    // so the TWR chain can start from the portfolio's real beginning regardless of the
    // display range the user selected. Results are filtered+re-normalised below.
    type DayEntry = { totalValue: number; extFlow: number; netDep: number };
    const portfolioDateMaps: Array<Record<string, DayEntry>> = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) return {};

        const fx = fxRates[portfolio.currency] ?? 1;
        const investTrades = trades.filter(t => t.security);
        const symbols = [...new Set(investTrades.map(t => t.security!.symbol))];
        const portfolioEarliestDate = investTrades.length
          ? investTrades.reduce((m, t) => t.trade_date < m ? t.trade_date : m, investTrades[0].trade_date)
          : toDate;

        const pricesBySymbol = await Promise.all(
          symbols.map(async (sym) => {
            const sec = trades.find(t => t.security?.symbol === sym)?.security;
            const prices = await getHistoricalPrices(sym, portfolioEarliestDate, toDate, sec?.id, sec?.exchange);
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

        // Build per-date map.
        // NOTE: extFlow uses extFlowByDate[date] directly (no weekend remapping).
        // In the group context, cross-currency FX transfers (AUD withdrawal + USD
        // deposit) are typically recorded on the same date and naturally cancel out
        // in the combined extFlow. Weekend remapping (which shifts each flow to the
        // next price date on its per-portfolio calendar) breaks that cancellation
        // because the AUD and USD portfolios have different trading calendars, so
        // the same-date flows land on different remapped dates. Using the raw date
        // preserves same-day cancellation; non-trading-day flows are simply absent
        // from the priceMap and thus dropped — which is acceptable for the group
        // because getCashAt() still captures the economic effect in totalValue.
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
        // Cannot compute a valid TWR factor — show null gap and freeze prevValue.
        // See reports.ts for the rationale: mutating prevValue during null periods
        // creates near-zero adjustedBase on the first valid day after the gap,
        // producing astronomical factors.
        portfolioGain.push({ date, value: null });
      }
    }

    // ── Display-window filtering + sub-period re-normalisation ───────────────
    // portfolioGain was computed from chartStartDate (earliest valid deposit+value).
    // Re-normalise to the display window [displayFrom, toDate] so the chart always
    // starts at 0% for the selected period.
    //
    // LAST-RUN-START rule: if portfolioGain has a null gap in the middle (e.g. from
    // an FX transfer temporarily making the group's combined value non-positive),
    // the series has multiple valid segments. Starting the display from the FIRST
    // segment would show the pre-gap history connected to the post-gap history via
    // a dashed null line — confusing and visually broken. Instead, prefer to start
    // from the LAST contiguous non-null run, which represents the group's current
    // portfolio composition. Short-range views (1Y, YTD) are unaffected because
    // their fromDate already lands in the last run.
    let lastRunStartIdx = 0;
    for (let gi = 1; gi < portfolioGain.length; gi++) {
      if (portfolioGain[gi].value !== null && portfolioGain[gi - 1].value === null) {
        lastRunStartIdx = gi; // last null→non-null transition
      }
    }
    const lastRunStartDate = portfolioGain[lastRunStartIdx].date;

    // displayFrom = the later of (user's range start, last valid run start).
    // Benchmarks are also fetched from displayFrom so they start at 0% at the
    // same reference point as the portfolio line.
    const userFrom   = fromDate > chartStartDate ? fromDate : chartStartDate;
    const displayFrom = userFrom > lastRunStartDate ? userFrom : lastRunStartDate;

    const dispIdx = portfolioGain.findIndex(d => d.value !== null && d.date >= displayFrom);
    if (dispIdx === -1) { res.json([]); return; }
    const dispBase = 1 + (portfolioGain[dispIdx].value as number) / 100;

    const visibleGain = portfolioGain
      .slice(dispIdx)
      .filter(d => d.date <= toDate)
      .map(d => ({
        date:  d.date,
        value: d.value !== null ? ((1 + d.value / 100) / dispBase - 1) * 100 : null,
      }));

    // ── Benchmarks ─────────────────────────────────────────────────────────
    // Fetched for [displayFrom, toDate] only — same window as the visible gain.
    // Forward-filled across visibleGain dates so ASX trading days (no US price)
    // still get a benchmark value.
    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, displayFrom, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500,  displayFrom, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, displayFrom, toDate),
    ]);

    const visibleDates = visibleGain.map(d => d.date);
    const benchFill = (arr: { date: string; close: number }[]): Record<string, number> => {
      if (!arr.length) return {};
      const base = arr[0].close;
      const raw: Record<string, number> = {};
      for (const d of arr) raw[d.date] = base > 0 ? (d.close / base - 1) * 100 : 0;
      let last: number | null = null;
      const filled: Record<string, number> = {};
      for (const date of visibleDates) {
        if (raw[date] !== undefined) last = raw[date];
        if (last !== null) filled[date] = last;
      }
      return filled;
    };

    const sp500Map  = benchFill(sp500);
    const nasdaqMap = benchFill(nasdaq);
    const asx200Map = benchFill(asx200);

    const result = visibleGain.map((d) => ({
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
// Combined CGT across all portfolios, with FX conversion at each disposal date
// (ATO-compliant: the rate used is the rate on the day of each sell, not today).
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
    const baseCurrency: string = group.base_currency ?? 'AUD';

    // Step 1 — compute all CGT lots per portfolio in parallel.
    const portfolioLots = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) return { portfolio, lots: [] as ReturnType<typeof calculateCapitalGains> };
        const lots = calculateCapitalGains(trades as any, params.data.fyStart, parseInt(params.data.year));
        return { portfolio, lots };
      }),
    );

    // Step 2 — collect every unique (currency, sell_date) pair that needs conversion.
    // Using the disposal-date rate is an ATO requirement; the same asset sold on
    // different days will get different FX rates.
    const fxPairSet = new Set<string>();
    for (const { portfolio, lots } of portfolioLots) {
      if (portfolio.currency === baseCurrency) continue;
      for (const lot of lots) {
        fxPairSet.add(`${portfolio.currency}|${lot.sell_date}`);
      }
    }

    // Step 3 — fetch all required rates in parallel (the set already deduplicates
    // so we never call the API twice for the same (currency, date) pair).
    const fxCache = new Map<string, number>();
    await Promise.all(
      [...fxPairSet].map(async (key) => {
        const [cur, date] = key.split('|');
        fxCache.set(key, await getForexRate(cur, baseCurrency, date));
      }),
    );
    const getFx = (currency: string, date: string): number => {
      if (currency === baseCurrency) return 1;
      return fxCache.get(`${currency}|${date}`) ?? 1;
    };

    // Step 4 — build response using the disposal-date FX for each lot.
    const allGains: any[] = [];
    for (const { portfolio, lots } of portfolioLots) {
      for (const lot of lots) {
        const fx = getFx(portfolio.currency, lot.sell_date);
        allGains.push({
          ...lot,
          // Map backend CgtLot fields to frontend CapitalGain shape
          is_long_term:            lot.hold_days >= 365,
          hold_period_days:        lot.hold_days,
          cgt_discount_applicable: lot.cgt_discount_eligible,
          cgt_discount_pct:        50,
          portfolio_id:            portfolio.id,
          portfolio_name:          portfolio.name,
          portfolio_currency:      portfolio.currency,
          // fx_rate here is the rate on the sell date, not today's rate
          fx_rate:                 fx,
          // net_gain_base / gross_gain_base are converted at the disposal-date rate
          // so the frontend summary stats are ATO-compliant totals.
          net_gain_base:           lot.net_gain   * fx,
          gross_gain_base:         lot.gross_gain * fx,
        });
      }
    }

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

    const { fyStart, year } = params.data;
    const yearNum = parseInt(year);
    const fyStartDate = fyStart === 'july' ? `${yearNum - 1}-07-01` : `${yearNum}-01-01`;
    const fyEndDate   = fyStart === 'july' ? `${yearNum}-06-30`     : `${yearNum}-12-31`;
    const today = format(new Date(), 'yyyy-MM-dd');

    // Step 1 — fetch trades and compute CGT lots per portfolio in parallel.
    const portfolioData = await Promise.all(
      portfolios.map(async (portfolio) => {
        const trades = await getPortfolioTrades(portfolio.id);
        const lots   = calculateCapitalGains(trades as any, fyStart, yearNum);
        return { portfolio, trades, lots };
      }),
    );

    // Step 2 — collect unique (currency, date) pairs needed for FX conversion:
    //   • Each CGT lot uses its sell_date (ATO-compliant disposal-date rate).
    //   • Dividends/interest use today's rate (income, not a disposal — kept simple
    //     for consistency with the per-portfolio tax report).
    //   • Today's rate is also stored for the per-portfolio display field fx_rate.
    const fxPairSet = new Set<string>();
    for (const { portfolio, lots } of portfolioData) {
      if (portfolio.currency === baseCurrency) continue;
      fxPairSet.add(`${portfolio.currency}|${today}`);          // for income & display
      for (const lot of lots) {
        fxPairSet.add(`${portfolio.currency}|${lot.sell_date}`); // ATO disposal-date rate
      }
    }

    // Step 3 — fetch all required FX rates in parallel (deduplicated).
    const fxCache = new Map<string, number>();
    await Promise.all(
      [...fxPairSet].map(async (key) => {
        const [cur, date] = key.split('|');
        fxCache.set(key, await getForexRate(cur, baseCurrency, date));
      }),
    );
    const getFx = (currency: string, date: string): number => {
      if (currency === baseCurrency) return 1;
      return fxCache.get(`${currency}|${date}`) ?? 1;
    };

    // Step 4 — build per-portfolio tax rows using disposal-date rates for CGT.
    const portfolioTaxData = portfolioData.map(({ portfolio, trades, lots }) => {
      const fxToday = getFx(portfolio.currency, today);
      const fyTrades = trades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);

      // Income: use today's rate (not a CGT disposal; kept consistent with
      // the individual-portfolio tax endpoint).
      const dividends = fyTrades.filter(t => t.trade_type === 'dividend');
      const interest  = fyTrades.filter(t => t.trade_type === 'interest');
      const dividendIncome = dividends.reduce((s, t) => s + (t.price * t.quantity) * fxToday, 0);
      const interestIncome = interest.reduce( (s, t) => s + (t.price * t.quantity) * fxToday, 0);

      // CGT: convert each lot at its disposal date rate (ATO requirement).
      const shortTerm = lots.filter(l => l.hold_days < 365)
        .reduce((s, l) => s + l.net_gain * getFx(portfolio.currency, l.sell_date), 0);
      const longTerm  = lots.filter(l => l.hold_days >= 365)
        .reduce((s, l) => s + l.net_gain * getFx(portfolio.currency, l.sell_date), 0);
      const discount  = lots.filter(l => l.cgt_discount_eligible)
        .reduce((s, l) => s + l.cgt_discount_amount * getFx(portfolio.currency, l.sell_date), 0);

      return {
        portfolio_id:       portfolio.id,
        portfolio_name:     portfolio.name,
        portfolio_currency: portfolio.currency,
        fx_rate:            fxToday, // today's rate shown for display only
        dividends_received:       dividendIncome,
        interest_received:        interestIncome,
        capital_gains_short_term: shortTerm,
        capital_gains_long_term:  longTerm,
        cgt_discount_applied:     discount,
        total_taxable_income:     dividendIncome + interestIncome + shortTerm + longTerm - discount,
      };
    });

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

// ── Shared helper: combined daily portfolio value series ─────────────────────
// Used by both the drawdown and statistics group endpoints so the aggregation
// logic is written once. Does NOT replicate the TWR chain — it returns raw
// combined total-value (investedValue + cash × fx) per trading date.
async function buildGroupDailyValues(
  portfolios: any[],
  fxRates: Record<string, number>,
  toDate: string,
): Promise<{ date: string; value: number }[]> {
  const portfolioDailyMaps: Record<string, number>[] = await Promise.all(
    portfolios.map(async (portfolio) => {
      const trades = await getPortfolioTrades(portfolio.id);
      if (!trades.length) return {};
      const fx = fxRates[portfolio.currency] ?? 1;
      const investTrades = trades.filter((t: Trade) => t.security);
      const symbols = [...new Set(investTrades.map((t: Trade) => t.security!.symbol))];
      const earliestDate = trades[0].trade_date;

      const pricesBySymbol = await Promise.all(
        symbols.map(async (sym: string) => {
          const sec = trades.find((t: Trade) => t.security?.symbol === sym)?.security;
          const prices = await getHistoricalPrices(sym, earliestDate, toDate, sec?.id, sec?.exchange);
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
      let cashAmt = 0;
      const cashEvents: [string, number][] = sortedTrades.map((t) => {
        if      (t.trade_type === 'deposit')    cashAmt += t.price * t.quantity;
        else if (t.trade_type === 'withdrawal') cashAmt -= t.price * t.quantity;
        else if (t.trade_type === 'buy')        cashAmt -= t.price * t.quantity + t.brokerage;
        else if (t.trade_type === 'sell')       cashAmt += t.price * t.quantity - t.brokerage;
        else if (t.trade_type === 'dividend')   cashAmt += t.price * t.quantity;
        return [t.trade_date, cashAmt] as [string, number];
      });
      const getCashAt = (date: string): number => {
        let val = 0;
        for (const [d, v] of cashEvents) { if (d <= date) val = v; else break; }
        return val;
      };

      const dateMap: Record<string, number> = {};
      for (const date of Object.keys(priceMap).sort()) {
        const dayHoldings = calculateHoldings(
          trades.filter((t) => t.trade_date <= date) as any,
          priceMap[date],
        );
        const invested = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
        dateMap[date] = (invested + getCashAt(date)) * fx;
      }
      return dateMap;
    }),
  );

  const allDates = [...new Set(portfolioDailyMaps.flatMap((m) => Object.keys(m)))].sort();
  const lastKnown = portfolioDailyMaps.map(() => 0);

  return allDates.map((date) => {
    let total = 0;
    for (let i = 0; i < portfolioDailyMaps.length; i++) {
      if (portfolioDailyMaps[i][date] !== undefined) lastKnown[i] = portfolioDailyMaps[i][date]!;
      total += lastKnown[i];
    }
    return { date, value: total };
  });
}

// ── GET /api/groups/:id/dividends ─────────────────────────────────────────────
// Aggregated dividend + interest income across all portfolios.
// All amounts are converted to base_currency at today's FX rate.
router.get('/:id/dividends', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? todayStr;
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);

    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(uniqueCurrencies.map(async (cur) => {
      fxRates[cur] = await getForexRate(cur, baseCurrency, todayStr);
    }));

    const allDividends: any[] = [];
    let total_dividends = 0;
    let total_interest  = 0;

    for (const portfolio of portfolios) {
      const fx = fxRates[portfolio.currency] ?? 1;
      let query = supabase
        .from('trades')
        .select('*, security:securities(*)')
        .eq('portfolio_id', portfolio.id)
        .in('trade_type', ['dividend', 'interest'])
        .order('trade_date', { ascending: false });

      if (fromDate) query = query.gte('trade_date', fromDate);
      if (toDate)   query = query.lte('trade_date', toDate);

      const { data } = await query;
      // Exclude synthetic CASH entries (deposits/withdrawals recorded as dividend/interest)
      for (const t of (data ?? []).filter((t: any) => t.security && t.security.symbol !== 'CASH')) {
        const amount     = t.price * t.quantity;
        const amountBase = amount * fx;
        if (t.trade_type === 'dividend') total_dividends += amountBase;
        else                             total_interest  += amountBase;

        allDividends.push({
          id:            t.id,
          portfolio_id:  t.portfolio_id,
          symbol:        t.security?.symbol ?? '',
          security_name: t.security?.name   ?? null,
          payment_date:  t.trade_date,
          amount:        amountBase,
          currency:      baseCurrency,
          is_reinvested: t.is_reinvested ?? false,
          franking_pct:  t.franking_pct  ?? null,
        });
      }
    }

    allDividends.sort((a, b) => b.payment_date.localeCompare(a.payment_date));

    res.json({
      total_dividends,
      total_interest,
      total_income: total_dividends + total_interest,
      dividends: allDividends,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/diversity ─────────────────────────────────────────────
// Aggregated portfolio allocation across all portfolios, converted to base currency.
router.get('/:id/diversity', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);

    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(uniqueCurrencies.map(async (cur) => {
      fxRates[cur] = await getForexRate(cur, baseCurrency, todayStr);
    }));

    // ── Phase 1: collect all trades, secMeta, and holdings across portfolios ─────
    type SecMetaEntry = { sector?: string|null; asset_type?: string|null; country?: string|null; exchange?: string|null };
    const secMeta: Record<string, SecMetaEntry> = {};
    const portfolioHoldings: Array<{ holdings: ReturnType<typeof calculateHoldings>; fx: number }> = [];

    for (const portfolio of portfolios) {
      const trades = await getPortfolioTrades(portfolio.id);
      for (const t of trades) {
        if (t.security && !secMeta[t.security.symbol]) secMeta[t.security.symbol] = t.security;
      }
      const securitiesMap = new Map<string, string>();
      trades.filter((t) => t.security).forEach((t) => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
      const currentPrices = await getCurrentPrices(
        Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })),
      );
      portfolioHoldings.push({ holdings: calculateHoldings(trades as any, currentPrices), fx: fxRates[portfolio.currency] ?? 1 });
    }

    // ── Phase 2: lazily enrich missing metadata from Yahoo Finance ────────────
    const toEnrich = Object.entries(secMeta).filter(([, m]) => !m.sector && !m.asset_type && !m.country);
    if (toEnrich.length > 0) {
      await Promise.all(toEnrich.map(async ([sym, m]) => {
        const enriched = await enrichSecurityMetadata(sym, m.exchange);
        secMeta[sym] = { ...secMeta[sym], ...enriched };
        await supabase.from('securities').update(enriched).eq('symbol', sym.toUpperCase());
      }));
    }

    // ── Phase 3: compute allocations ─────────────────────────────────────────
    const bySector:  Record<string, number> = {};
    const byType:    Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const byMarket:  Record<string, number> = {};
    let total = 0;

    for (const { holdings, fx } of portfolioHoldings) {
      for (const h of holdings) {
        const mv = (h.market_value ?? 0) * fx;
        if (mv <= 0) continue;
        const m = secMeta[h.symbol] ?? {};
        bySector[m.sector     || 'Other']   = (bySector[m.sector     || 'Other']   ?? 0) + mv;
        byType[m.asset_type   || 'Other']   = (byType[m.asset_type   || 'Other']   ?? 0) + mv;
        byCountry[m.country   || 'Unknown'] = (byCountry[m.country   || 'Unknown'] ?? 0) + mv;
        byMarket[m.exchange   || 'Unknown'] = (byMarket[m.exchange   || 'Unknown'] ?? 0) + mv;
        total += mv;
      }
    }

    const toSlices = (obj: Record<string, number>) =>
      Object.entries(obj)
        .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);

    res.json({
      by_sector:          toSlices(bySector),
      by_investment_type: toSlices(byType),
      by_country:         toSlices(byCountry),
      by_market:          toSlices(byMarket),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/drawdown ──────────────────────────────────────────────
// Rolling peak-to-trough drawdown from combined group daily portfolio value.
router.get('/:id/drawdown', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? todayStr;
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) { res.json([]); return; }

    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(uniqueCurrencies.map(async (cur) => {
      fxRates[cur] = await getForexRate(cur, baseCurrency, todayStr);
    }));

    const dailyValues = await buildGroupDailyValues(portfolios, fxRates, toDate);

    let peak = 0;
    const result: { date: string; drawdown: number }[] = [];
    for (const { date, value } of dailyValues) {
      if (value > peak) peak = value;
      if (date < fromDate || date > toDate) continue;
      result.push({ date, drawdown: peak > 0 ? ((value - peak) / peak) * 100 : 0 });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/statistics ───────────────────────────────────────────
// Portfolio statistics derived from combined group daily values.
router.get('/:id/statistics', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? todayStr;
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) {
      res.json({ total_return_annualized: 0, winning_months_pct: 0, max_drawdown: 0, std_dev_monthly: 0, sharpe_ratio: 0, sortino_ratio: 0, beta: 0, correlation_sp500: 0, total_return: 0, total_return_pct: 0 });
      return;
    }

    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(uniqueCurrencies.map(async (cur) => {
      fxRates[cur] = await getForexRate(cur, baseCurrency, todayStr);
    }));

    const dailyValues = await buildGroupDailyValues(portfolios, fxRates, toDate);
    const inRange = dailyValues.filter((d) => d.date >= fromDate && d.date <= toDate);

    const monthlyReturns = computeMonthlyReturns(inRange);

    const [asx200, sp500] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, fromDate, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500,  fromDate, toDate),
    ]);

    const benchReturns = computeMonthlyReturns(asx200.map((d) => ({ date: d.date, value: d.close })));
    const sp500Returns  = computeMonthlyReturns(sp500.map((d) => ({ date: d.date, value: d.close })));

    const stats = computeStatistics(monthlyReturns, benchReturns, sp500Returns);
    res.json({ ...stats, total_return: 0, total_return_pct: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups/:id/monthly-profit ────────────────────────────────────────
// Aggregates month-by-month P&L across all portfolios, converting each to the
// group's base_currency at today's FX rate (consistent with the group summary).
// profit     = sum of each portfolio's (end_value − start_value − net_flows) × fx
// return_pct = aggregated_profit / aggregated_start_value × 100
router.get('/:id/monthly-profit', async (req: AuthenticatedRequest, res: any) => {
  const group = await getGroup(req.params.id as string, req.userId!);
  if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? todayStr;
  const baseCurrency: string = group.base_currency ?? 'AUD';

  try {
    const portfolios = await getGroupPortfolios(req.params.id as string, req.userId!);
    if (!portfolios.length) { res.json([]); return; }

    // Today's FX rates for all non-base currencies
    const uniqueCurrencies = [...new Set(portfolios.map((p) => p.currency))].filter((c) => c !== baseCurrency);
    const fxRates: Record<string, number> = { [baseCurrency]: 1 };
    await Promise.all(
      uniqueCurrencies.map(async (cur) => {
        fxRates[cur] = await getForexRate(cur, baseCurrency, todayStr);
      }),
    );

    // ── Per-portfolio: build monthly last-value and net flows ────────────────
    type MonthMap = Record<string, number>; // YYYY-MM → amount in base currency
    const allPortfolioMonthValues: MonthMap[] = [];
    const allPortfolioMonthFlows:  MonthMap[] = [];

    await Promise.all(
      portfolios.map(async (portfolio, idx) => {
        const trades = await getPortfolioTrades(portfolio.id);
        if (!trades.length) {
          allPortfolioMonthValues[idx] = {};
          allPortfolioMonthFlows[idx]  = {};
          return;
        }

        const fx = fxRates[portfolio.currency] ?? 1;

        const investmentTrades = trades.filter(
          (t) => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal',
        );
        const symbols = [...new Set(investmentTrades.filter((t) => t.security).map((t) => t.security!.symbol))];
        const earliestDate = trades[0].trade_date;

        const pricesBySymbol = await Promise.all(
          symbols.map(async (sym) => {
            const sec = trades.find((t) => t.security?.symbol === sym)?.security;
            const prices = await getHistoricalPrices(sym, earliestDate, toDate, sec?.id, sec?.exchange);
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
        let cashAmt = 0;
        const cashEvents: [string, number][] = sortedTrades.map((t) => {
          if      (t.trade_type === 'deposit')                         cashAmt += t.price * t.quantity;
          else if (t.trade_type === 'withdrawal')                      cashAmt -= t.price * t.quantity;
          else if (t.trade_type === 'buy' || t.trade_type === 'drp') cashAmt -= t.price * t.quantity + t.brokerage;
          else if (t.trade_type === 'sell')                            cashAmt += t.price * t.quantity - t.brokerage;
          else if (t.trade_type === 'dividend')                        cashAmt += t.price * t.quantity;
          return [t.trade_date, cashAmt] as [string, number];
        });
        const getCashAt = (date: string): number => {
          let val = 0;
          for (const [d, v] of cashEvents) { if (d <= date) val = v; else break; }
          return val;
        };

        // Monthly last total-value in base currency
        const monthValues: MonthMap = {};
        for (const date of Object.keys(priceMap).sort()) {
          const dayHoldings = calculateHoldings(trades.filter((t) => t.trade_date <= date) as any, priceMap[date]);
          const invested = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
          monthValues[date.slice(0, 7)] = (invested + getCashAt(date)) * fx;
        }

        // Monthly net external flows in base currency
        const monthFlows: MonthMap = {};
        for (const t of sortedTrades) {
          if (t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal') continue;
          const amount = t.price * t.quantity * (t.trade_type === 'withdrawal' ? -1 : 1) * fx;
          const m = t.trade_date.slice(0, 7);
          monthFlows[m] = (monthFlows[m] ?? 0) + amount;
        }

        allPortfolioMonthValues[idx] = monthValues;
        allPortfolioMonthFlows[idx]  = monthFlows;
      }),
    );

    // ── Aggregate across portfolios ──────────────────────────────────────────
    const allMonths = new Set<string>();
    for (const mv of allPortfolioMonthValues) Object.keys(mv).forEach((m) => allMonths.add(m));
    const months = [...allMonths].sort();

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const result = [];

    // Carry-forward: last known value per portfolio (handles months with no price data)
    const lastKnown = allPortfolioMonthValues.map(() => 0);

    for (let i = 1; i < months.length; i++) {
      const m    = months[i]!;
      const prev = months[i - 1]!;
      if (m < fromDate.slice(0, 7) || m > toDate.slice(0, 7)) {
        // Still update lastKnown so the carry-forward stays accurate
        for (let p = 0; p < allPortfolioMonthValues.length; p++) {
          if (allPortfolioMonthValues[p][prev] !== undefined) lastKnown[p] = allPortfolioMonthValues[p][prev]!;
        }
        continue;
      }

      let groupStartValue = 0;
      let groupEndValue   = 0;
      let groupNetFlow    = 0;

      for (let p = 0; p < allPortfolioMonthValues.length; p++) {
        // start = last value from previous month (carry-forward if no price that month)
        const prevVal = allPortfolioMonthValues[p][prev] ?? lastKnown[p];
        const endVal  = allPortfolioMonthValues[p][m]   ?? prevVal;
        groupStartValue += prevVal;
        groupEndValue   += endVal;
        groupNetFlow    += allPortfolioMonthFlows[p][m] ?? 0;
        // Update carry-forward
        lastKnown[p] = allPortfolioMonthValues[p][m] ?? lastKnown[p];
      }

      const profit     = groupEndValue - groupStartValue - groupNetFlow;
      const denom      = groupStartValue + groupNetFlow * 0.5; // Modified Dietz
      const return_pct = denom > 0 ? (profit / denom) * 100 : 0;

      const year  = parseInt(m.slice(0, 4), 10);
      const month = parseInt(m.slice(5, 7), 10);
      result.push({
        year,
        month,
        month_label: `${MONTH_NAMES[month - 1]} ${year}`,
        profit,
        return_pct,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
