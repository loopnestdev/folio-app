import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCapitalGains, calculateCashPosition } from '../services/calculations/holdings';
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
    const equityHoldings = rawHoldings.map((h) => ({ ...h, total_cost: h.cost_base }));

    // Cash position — synthetic CASH row so it appears in Holdings + pie charts
    const { cash_balance, total_deposited, total_withdrawn } = calculateCashPosition(trades as any);
    const { data: portfolio } = await supabase.from('portfolios').select('currency').eq('id', id).single();
    const portfolioCurrency = (portfolio as any)?.currency ?? 'AUD';

    const cashHolding = cash_balance !== 0 ? [{
      security_id:        'cash',
      symbol:             'CASH',
      security_name:      'Cash',
      exchange:           '',
      currency:           portfolioCurrency,
      quantity:           cash_balance,
      avg_cost:           1,
      cost_base:          cash_balance,
      total_cost:         cash_balance,
      current_price:      1,
      market_value:       cash_balance,
      unrealized_gain:    0,
      unrealized_gain_pct: 0,
    }] : [];

    const holdings = [...equityHoldings, ...cashHolding];

    // Only include holdings with a known price in the gain totals to avoid
    // distorting the summary when Yahoo Finance has no data for a security.
    const pricedHoldings = holdings.filter((h) => h.market_value != null);
    const totalValue = pricedHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const totalCost  = equityHoldings.filter(h => h.market_value != null).reduce((s, h) => s + (h.total_cost ?? 0), 0);
    const totalGain  = totalValue - totalCost - cash_balance; // gain on invested portion only

    const netDeposited   = total_deposited - total_withdrawn;
    const overallGain    = totalValue - netDeposited;
    // When net_deposited ≤ 0 the % is meaningless (division by non-positive base). Return null
    // so the frontend can render "—" instead of a misleading 0.00%.
    const overallGainPct = netDeposited > 0 ? (overallGain / netDeposited) * 100 : null;

    res.json({
      holdings,
      summary: {
        total_value:      totalValue,
        total_cost:       totalCost,
        total_gain:       totalGain,
        total_gain_pct:   totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
        cash_balance,
        total_deposited,
        total_withdrawn,
        net_deposited:    netDeposited,
        overall_gain:     overallGain,
        overall_gain_pct: overallGainPct,
      },
    });
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

    const { cash_balance, total_deposited, total_withdrawn } = calculateCashPosition(trades as any);

    const investedValue  = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const totalValue     = investedValue + cash_balance;
    const totalCost      = holdings.reduce((s, h) => s + h.cost_base, 0);
    const totalGain      = investedValue - totalCost;
    const netDeposited   = total_deposited - total_withdrawn;
    const overallGain    = totalValue - netDeposited;
    const overallGainPct = netDeposited > 0 ? (overallGain / netDeposited) * 100 : null;

    // YTD: compare current value against portfolio value at the start of this year.
    // Must use HISTORICAL prices at Jan 1 (not today's prices) for the start valuation —
    // otherwise if there are no trades in the current year, ytdReturn is always 0.
    const thisYear = new Date().getFullYear();
    const ytdStartDate = `${thisYear}-01-01`;
    const ytdEndDate   = `${thisYear}-01-10`; // fetch first 10 days to catch first trading day
    const tradesBeforeYTD = trades.filter(t => t.trade_date < ytdStartDate);

    const ytdPriceEntries = await Promise.all(
      Array.from(securitiesMap.entries()).map(async ([sym, exchange]) => {
        const prices = await getHistoricalPrices(sym, ytdStartDate, ytdEndDate, undefined, exchange);
        return [sym, prices[0]?.close ?? null] as [string, number | null];
      })
    );
    const ytdPrices: Record<string, number> = {};
    for (const [sym, price] of ytdPriceEntries) {
      if (price !== null) ytdPrices[sym] = price as number;
    }

    const holdingsAtYTDStart = calculateHoldings(tradesBeforeYTD as any, ytdPrices);
    const { cash_balance: cashAtYTDStart } = calculateCashPosition(tradesBeforeYTD as any);
    const valueAtYTDStart = holdingsAtYTDStart.reduce((s, h) => s + (h.market_value ?? 0), 0) + cashAtYTDStart;
    const ytdReturn = totalValue - valueAtYTDStart;

    res.json({
      total_value:      totalValue,
      invested_value:   investedValue,
      total_cost:       totalCost,
      total_gain:       totalGain,
      total_gain_pct:   totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
      cash_balance,
      total_deposited,
      total_withdrawn,
      net_deposited:    netDeposited,
      overall_gain:     overallGain,
      overall_gain_pct: overallGainPct,
      ytd_return:       ytdReturn,
      // null when YTD start value ≤ 0 (e.g. portfolio funded by FX transfers) — "—" in UI
      ytd_return_pct:   valueAtYTDStart > 0 ? (ytdReturn / valueAtYTDStart) * 100 : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/performance
router.get('/:id/performance', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  // The frontend computes the date window from the selected range and sends
  // start_date / end_date directly (via dateRangeToParams in utils.ts).
  const today = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? today;

  try {
    const trades = await getPortfolioTrades(id);
    // Empty portfolio — return empty array so the chart renders the "no data" state
    if (!trades.length) { res.json([]); return; }

    // TWR requires price history from the very first trade, regardless of the
    // user's selected display range. We fetch from earliestTradeDate so that
    // chartStartIdx (first date with netDep > 0 AND totalValue > 0) is always
    // found even when the display range starts after that date.
    // The returned data is then filtered+re-normalised to the display window.
    const investmentTrades = trades.filter(t => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal');
    const earliestTradeDate = investmentTrades.length
      ? investmentTrades.reduce((min, t) => t.trade_date < min ? t.trade_date : min, investmentTrades[0].trade_date)
      : trades[0].trade_date;

    // displayFrom: where the user wants the chart to start (≥ earliestTrade)
    const displayFrom = fromDate > earliestTradeDate ? fromDate : earliestTradeDate;

    const symbols = [...new Set(investmentTrades.filter(t => t.security).map(t => t.security!.symbol))];

    // Benchmarks are fetched for the DISPLAY window only (not full history).
    // They start at 0% at displayFrom and are compared against the portfolio
    // sub-period TWR (also re-normalised to 0% at displayFrom below).
    const [asx200, sp500, nasdaq] = await Promise.all([
      getBenchmarkPrices(BENCHMARKS.ASX200, displayFrom, toDate),
      getBenchmarkPrices(BENCHMARKS.SP500, displayFrom, toDate),
      getBenchmarkPrices(BENCHMARKS.NASDAQ, displayFrom, toDate),
    ]);

    // Build daily portfolio value — fetch from EARLIEST TRADE DATE (not displayFrom)
    // so the complete TWR chain can be computed from the portfolio's beginning.
    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find(t => t.security?.symbol === sym)?.security;
        const prices = await getHistoricalPrices(sym, earliestTradeDate, toDate, sec?.id, sec?.exchange);
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

    // ── Time-Weighted Return (TWR) ────────────────────────────────────────────
    // TWR chains daily returns and neutralises the effect of external cash flows
    // (deposits, withdrawals) and in-specie Transfer-In events (shares received
    // at $0 cost). This is the industry standard for performance measurement and
    // fixes two problems with simpler formulas:
    //
    //   1. "(total − net_dep) / net_dep" is sensitive to denominator size — a small
    //      net_deposited + large position = extreme % swings on normal price moves.
    //   2. Large deposits/withdrawals (e.g. FX transfers) would spike the chart.
    //
    // Formula per day:
    //   daily_factor = value_t / (value_{t−1} + external_flows_on_t)
    //   TWR_t        = (Π daily_factors − 1) × 100
    //
    // External flows excluded from return (capital movements, not performance):
    //   • deposit / withdrawal trades
    //   • buy trades at price=0 (Transfer-In from broker, value added "for free")

    const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

    // Running cash (for portfolio value calculation)
    const runningCash: [string, number][] = (() => {
      let cash = 0;
      return sortedTrades.map(t => {
        const qty   = Number(t.quantity)   || 0;
        const price = Number(t.price)      || 0;
        const brok  = Number(t.brokerage)  || 0;
        if      (t.trade_type === 'deposit')                        cash += price * qty;
        else if (t.trade_type === 'withdrawal')                     cash -= price * qty;
        else if (t.trade_type === 'buy' || t.trade_type === 'drp') cash -= price * qty + brok;
        else if (t.trade_type === 'sell')                           cash += price * qty - brok;
        else if (t.trade_type === 'dividend')                       cash += price * qty;
        return [t.trade_date, cash] as [string, number];
      });
    })();

    const getCashAt = (date: string): number => {
      let val = 0;
      for (const [d, v] of runningCash) { if (d <= date) val = v; else break; }
      return val;
    };

    // External flows by date (deposits + withdrawals + transfer-in market value)
    const externalFlowsByDate: Record<string, number> = {};
    for (const t of sortedTrades) {
      const qty   = Number(t.quantity) || 0;
      const price = Number(t.price)    || 0;
      if (t.trade_type === 'deposit') {
        externalFlowsByDate[t.trade_date] = (externalFlowsByDate[t.trade_date] ?? 0) + price * qty;
      } else if (t.trade_type === 'withdrawal') {
        externalFlowsByDate[t.trade_date] = (externalFlowsByDate[t.trade_date] ?? 0) - price * qty;
      } else if (t.trade_type === 'buy' && price === 0 && qty > 0) {
        // Transfer-In at $0: treat as external inflow at market value so the
        // "free" shares do not inflate TWR performance.
        const sym      = (t as any).security?.symbol ?? '';
        const mktPrice = priceMap[t.trade_date]?.[sym] ?? 0;
        if (mktPrice > 0) {
          externalFlowsByDate[t.trade_date] = (externalFlowsByDate[t.trade_date] ?? 0) + mktPrice * qty;
        }
      }
    }

    const portfolioValues = Object.keys(priceMap).sort().map((date) => {
      const dayPrices   = priceMap[date];
      const dayHoldings = calculateHoldings(
        trades.filter(t => t.trade_date <= date) as any, dayPrices
      );
      const investedValue = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
      return { date, totalValue: investedValue + getCashAt(date) };
    });

    // ── TWR start: find first price-date with BOTH positive net deposits AND
    //    positive total portfolio value.
    //
    //    TWR is mathematically undefined (or inverted) when portfolio value is ≤ 0:
    //      - negative / negative  = "positive" factor even when portfolio worsened
    //      - positive / negative  = negative factor (explodes the chain)
    //    Skipping the pre-deposit / temporarily-negative period ensures the chain
    //    starts on a meaningful, stable baseline.

    const runningNetDep: [string, number][] = (() => {
      let net = 0;
      return sortedTrades
        .filter(t => t.trade_type === 'deposit' || t.trade_type === 'withdrawal')
        .map(t => {
          const qty = Number(t.quantity) || 0;
          const price = Number(t.price) || 0;
          net += t.trade_type === 'deposit' ? price * qty : -(price * qty);
          return [t.trade_date, net] as [string, number];
        });
    })();
    const getNetDepAt = (date: string): number => {
      let val = 0;
      for (const [d, v] of runningNetDep) { if (d <= date) val = v; else break; }
      return val;
    };

    const chartStartIdx = portfolioValues.findIndex(
      ({ date, totalValue }) => getNetDepAt(date) > 0 && totalValue > 0
    );
    if (chartStartIdx === -1) { res.json([]); return; }

    const chartStart = portfolioValues[chartStartIdx].date;

    // ── External-flow remapping ─────────────────────────────────────────────
    // Deposits and withdrawals can be recorded on weekends or public holidays
    // when markets are closed and there is no entry in portfolioValues for that
    // date. If we look up externalFlowsByDate[priceDate] only for exact price
    // dates, those non-trading-day flows are silently dropped: getCashAt()
    // already reflects the updated cash balance, but the TWR denominator
    // (adjustedBase) isn't adjusted — producing a phantom gain or loss on the
    // following trading day.
    //
    // Fix: assign every flow to the NEXT available price date on or after its
    // trade date so the denominator and the cash balance always match.
    // Flows on or before chartStart are skipped because they are already baked
    // into prevValue = portfolioValues[chartStartIdx].totalValue.
    const priceDates   = portfolioValues.map(v => v.date);
    const extFlowForTWR: Record<string, number> = {};
    for (const [flowDate, flowAmt] of Object.entries(externalFlowsByDate)) {
      if (flowDate <= chartStart) continue; // already absorbed into prevValue
      const target = priceDates.find(d => d >= flowDate);
      if (target) extFlowForTWR[target] = (extFlowForTWR[target] ?? 0) + flowAmt;
    }

    // Chain daily TWR factors from chartStart.
    // When adjustedBase ≤ 0 OR totalValue ≤ 0 the formula is undefined — push null
    // (chart gap) so the line is broken rather than showing inverted/exploded values.
    let multiplier = 1.0;
    let prevValue  = portfolioValues[chartStartIdx].totalValue;

    const portfolioGain: { date: string; value: number | null }[] = [
      { date: chartStart, value: 0.0 },
    ];

    for (let i = chartStartIdx + 1; i < portfolioValues.length; i++) {
      const { date, totalValue } = portfolioValues[i];
      const extFlow      = extFlowForTWR[date] ?? 0;
      const adjustedBase = prevValue + extFlow;

      if (adjustedBase > 0 && totalValue > 0) {
        multiplier *= totalValue / adjustedBase;
        portfolioGain.push({ date, value: (multiplier - 1) * 100 });
        prevValue = totalValue;
      } else {
        // Portfolio temporarily non-positive (large withdrawal exceeds value, or FX drain).
        // Show a gap rather than an inverted/undefined data point.
        //
        // IMPORTANT: still update prevValue to the current totalValue (even when negative).
        // If prevValue is frozen at the last-valid value and a large extFlow later arrives
        // (e.g. the matching USD deposit from an AUD→USD FX transfer), adjustedBase becomes
        // prevValue_frozen + extFlow, which is much larger than the actual combined value.
        // That produces a phantom loss on the deposit day and a phantom gain when the
        // portfolio recovers — the "big jump after null gap" pattern in the group chart.
        // By updating prevValue here, subsequent extFlows are applied against the correct
        // (possibly negative) baseline so the chain resumes accurately.
        prevValue = totalValue;
        portfolioGain.push({ date, value: null });
      }
    }

    // ── Display-window filtering + sub-period TWR re-normalisation ───────────
    // portfolioGain was computed from chartStart (earliest valid date).
    // The user may have selected a shorter window (e.g. 1Y). We:
    //   1. Find the first portfolioGain date ≥ displayFrom with a non-null value.
    //   2. Re-normalise: sub-period gain = (M_t / M_displayFrom − 1) × 100
    //      so the chart always starts at 0% for the selected period.
    //   3. Trim to [displayFrom, toDate].
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

    // Benchmarks: 0-based from displayFrom, forward-filled across portfolio dates
    // so ASX trading days (no US market price) still get a value.
    const allGainDates = visibleGain.map(d => d.date);
    const benchMap = (arr: { date: string; close: number }[]) => {
      if (!arr.length) return {} as Record<string, number>;
      const base = arr[0].close;
      const raw: Record<string, number> = {};
      for (const d of arr) raw[d.date] = base > 0 ? (d.close / base - 1) * 100 : 0;
      // Forward-fill so gap days (weekends, ASX vs NYSE mismatches) still have a value
      let last: number | null = null;
      const filled: Record<string, number> = {};
      for (const date of allGainDates) {
        if (raw[date] !== undefined) last = raw[date];
        if (last !== null) filled[date] = last;
      }
      return filled;
    };

    const sp500Map  = benchMap(sp500);
    const nasdaqMap = benchMap(nasdaq);
    const asx200Map = benchMap(asx200);

    const merged = visibleGain.map(d => ({
      date:             d.date,
      portfolio_value:  d.value,
      benchmark_sp500:  sp500Map[d.date]  ?? null,
      benchmark_nasdaq: nasdaqMap[d.date] ?? null,
      benchmark_asx200: asx200Map[d.date] ?? null,
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
    // Exclude deposit/withdrawal trades — their CASH security has no price history
    const investmentTrades = trades.filter(t => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal');
    const symbols = [...new Set(investmentTrades.filter(t => t.security).map(t => t.security!.symbol))];

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
