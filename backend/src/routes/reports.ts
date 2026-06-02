import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCapitalGains, calculateCashPosition } from '../services/calculations/holdings';
import { computeStatistics, computeMonthlyReturns } from '../services/calculations/statistics';
import { getHistoricalPrices, getBenchmarkPrices, getCurrentPrices, BENCHMARKS, enrichSecurityMetadata } from '../services/market-data/yahoo';
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
      res.json({ total_value: 0, total_cost: 0, total_gain: 0, total_gain_pct: 0, cash_balance: 0, ytd_return: 0, ytd_return_pct: 0, fy_ytd_return: 0, fy_ytd_return_pct: 0, fy_start_date: null });
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
    const now       = new Date();
    const thisYear  = now.getFullYear();
    const thisMonth = now.getMonth(); // 0 = Jan … 11 = Dec

    const ytdStartDate = `${thisYear}-01-01`;
    const ytdEndDate   = `${thisYear}-01-10`; // fetch first 10 days to catch first trading day

    // Australian FY: Jul 1 – Jun 30. If current month < 6 (before July), FY started Jul 1 of the prev year.
    const fyStartYear = thisMonth < 6 ? thisYear - 1 : thisYear;
    const fyStartDate = `${fyStartYear}-07-01`;
    const fyEndDate   = `${fyStartYear}-07-15`;

    const tradesBeforeYTD = trades.filter(t => t.trade_date < ytdStartDate);
    const tradesBeforeFY  = trades.filter(t => t.trade_date < fyStartDate);

    const secEntries = Array.from(securitiesMap.entries());

    const [ytdPriceEntries, fyPriceEntries] = await Promise.all([
      Promise.all(secEntries.map(async ([sym, exchange]) => {
        const prices = await getHistoricalPrices(sym, ytdStartDate, ytdEndDate, undefined, exchange);
        return [sym, prices[0]?.close ?? null] as [string, number | null];
      })),
      Promise.all(secEntries.map(async ([sym, exchange]) => {
        const prices = await getHistoricalPrices(sym, fyStartDate, fyEndDate, undefined, exchange);
        return [sym, prices[0]?.close ?? null] as [string, number | null];
      })),
    ]);

    const ytdPrices: Record<string, number> = {};
    for (const [sym, price] of ytdPriceEntries) {
      if (price !== null) ytdPrices[sym] = price as number;
    }
    const fyPrices: Record<string, number> = {};
    for (const [sym, price] of fyPriceEntries) {
      if (price !== null) fyPrices[sym] = price as number;
    }

    const holdingsAtYTDStart = calculateHoldings(tradesBeforeYTD as any, ytdPrices);
    const { cash_balance: cashAtYTDStart } = calculateCashPosition(tradesBeforeYTD as any);
    const valueAtYTDStart = holdingsAtYTDStart.reduce((s, h) => s + (h.market_value ?? 0), 0) + cashAtYTDStart;
    const ytdReturn = totalValue - valueAtYTDStart;

    const holdingsAtFYStart = calculateHoldings(tradesBeforeFY as any, fyPrices);
    const { cash_balance: cashAtFYStart } = calculateCashPosition(tradesBeforeFY as any);
    const valueAtFYStart = holdingsAtFYStart.reduce((s, h) => s + (h.market_value ?? 0), 0) + cashAtFYStart;
    const fyYtdReturn = totalValue - valueAtFYStart;

    res.json({
      total_value:        totalValue,
      invested_value:     investedValue,
      total_cost:         totalCost,
      total_gain:         totalGain,
      total_gain_pct:     totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
      cash_balance,
      total_deposited,
      total_withdrawn,
      net_deposited:      netDeposited,
      overall_gain:       overallGain,
      overall_gain_pct:   overallGainPct,
      ytd_return:         ytdReturn,
      ytd_return_pct:     valueAtYTDStart > 0 ? (ytdReturn / valueAtYTDStart) * 100 : null,
      fy_ytd_return:      fyYtdReturn,
      fy_ytd_return_pct:  valueAtFYStart > 0 ? (fyYtdReturn / valueAtFYStart) * 100 : null,
      fy_start_date:      fyStartDate,
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
      const cashBalance   = getCashAt(date);
      // Store cashBalance separately so the TWR loop can detect overdraft states.
      return { date, totalValue: investedValue + cashBalance, cashBalance };
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
    //
    // CHAIN-BREAK rule: if a withdrawal drives adjustedBase ≤ 0 (the withdrawal
    // exceeded the portfolio's last valid value), set chainBroken = true and push
    // nulls for ALL remaining dates.
    //
    // Why this matters: after an overdraft withdrawal the portfolio's NAV can be
    // permanently negative (cash deeply negative, small holdings). Stock price
    // fluctuations may occasionally push totalValue briefly above zero. Without
    // chainBroken, the chain would "resume" comparing that tiny positive value
    // against a large frozen prevValue (from before the withdrawal), producing an
    // astronomical downward factor (e.g. −87% or −95%). chainBroken prevents that.
    let multiplier  = 1.0;
    let prevValue   = portfolioValues[chartStartIdx].totalValue;
    let chainBroken = false; // true once a withdrawal exceeds the portfolio's value

    const portfolioGain: { date: string; value: number | null }[] = [
      { date: chartStart, value: 0.0 },
    ];

    for (let i = chartStartIdx + 1; i < portfolioValues.length; i++) {
      const { date, totalValue, cashBalance } = portfolioValues[i];
      const extFlow      = extFlowForTWR[date] ?? 0;
      const adjustedBase = prevValue + extFlow;

      // ── Chain-break detection (evaluated before every step) ────────────────
      // All three conditions are checked here — not only in the null branch —
      // so that condition 3 can fire even when both adjustedBase and totalValue
      // are technically positive (the scenario that caused the −99% crash).
      if (!chainBroken) {
        // 1. Withdrawal directly made adjustedBase ≤ 0 (withdrawal > prevValue).
        if (extFlow < 0 && adjustedBase <= 0) chainBroken = true;

        // 2. Permanent overdraft: more withdrawn than deposited AND portfolio is
        //    underwater. Any brief stock-price recovery would resume the chain
        //    comparing a tiny totalValue against a large frozen prevValue.
        if (totalValue <= 0 && getNetDepAt(date) < 0) chainBroken = true;

        // 3. Cash overdraft dominates the portfolio value.
        //    Fires when negative cash (from any source — withdrawal, buy overdraft,
        //    settlement timing) is LARGER than the total portfolio value. In this
        //    leveraged state each 1% stock move causes extreme amplified TWR swings;
        //    the chain produces oscillating zombie data if allowed to continue.
        //
        //    Example (AUD portfolio after FX transfer):
        //      cashBalance = −A$13,522 · stocks = A$14,000 · totalValue = A$478
        //      totalValue (A$478) < -cashBalance (A$13,522) → chain breaks cleanly.
        //
        //    Note: this may also fire on T+2 settlement timing or a buy that
        //    temporarily exceeded available cash. That is an acceptable trade-off —
        //    the alternative (zombie oscillation) is far more misleading.
        if (cashBalance < 0 && totalValue < -cashBalance) chainBroken = true;
      }

      if (!chainBroken && adjustedBase > 0 && totalValue > 0) {
        multiplier *= totalValue / adjustedBase;
        portfolioGain.push({ date, value: (multiplier - 1) * 100 });
        prevValue = totalValue;
      } else {
        // Cannot compute a valid TWR factor. Show a null gap and freeze prevValue.
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

  // Accept start_date/end_date (matching what the frontend sends) with fallback to
  // the legacy range/from/to params so existing callers aren't broken.
  const query = req.query as Record<string, string>;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const fromDate = query.start_date ?? (() => {
    const { fromDate: fd } = getDateRange(query.range ?? 'ALL', query.from, query.to);
    return fd;
  })();
  const toDate = query.end_date ?? (() => {
    const { toDate: td } = getDateRange(query.range ?? 'ALL', query.from, query.to);
    return td;
  })();

  try {
    const trades = await getPortfolioTrades(id);
    // Exclude deposit/withdrawal trades — their CASH security has no price history
    const investmentTrades = trades.filter(t => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal');
    const symbols = [...new Set(investmentTrades.filter(t => t.security).map(t => t.security!.symbol))];

    // Only fetch prices from the earliest actual trade date (or fromDate, whichever is later)
    // to avoid requesting decades of data for "All" ranges on young portfolios.
    const earliestTrade = investmentTrades.length
      ? investmentTrades.reduce((min, t) => t.trade_date < min ? t.trade_date : min, investmentTrades[0].trade_date)
      : fromDate;
    const fetchFrom = fromDate > earliestTrade ? fromDate : earliestTrade;

    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find(t => t.security?.symbol === sym)?.security;
        return { symbol: sym, prices: await getHistoricalPrices(sym, fetchFrom, toDate, sec?.id, sec?.exchange) };
      })
    );

    const priceMap: Record<string, Record<string, number>> = {};
    for (const { symbol, prices } of pricesBySymbol) {
      for (const { date, close } of prices) {
        if (!priceMap[date]) priceMap[date] = {};
        priceMap[date][symbol] = close;
      }
    }

    const allPortfolioValues = Object.keys(priceMap).sort().map((date) => ({
      date,
      value: calculateHoldings(trades.filter(t => t.trade_date <= date) as any, priceMap[date]).reduce((s, h) => s + (h.market_value ?? 0), 0),
    }));

    // Filter to the requested date window (fromDate may be after earliest trade date)
    const portfolioValues = allPortfolioValues.filter(v => v.date >= fromDate && v.date <= toDate);
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

// GET /api/portfolios/:id/reports/monthly-profit
// Returns month-by-month P&L adjusted for external cash flows (Modified Dietz).
// profit      = end_value − start_value − net_flows_this_month
// return_pct  = profit / (start_value + 0.5 × net_flows) × 100
router.get('/:id/reports/monthly-profit', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const today = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? today;

  try {
    const trades = await getPortfolioTrades(id);
    if (!trades.length) { res.json([]); return; }

    const investmentTrades = trades.filter(
      (t) => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal',
    );
    const symbols = [...new Set(investmentTrades.filter((t) => t.security).map((t) => t.security!.symbol))];

    // Fetch from earliest trade so cash is accurate from day one.
    const earliestTradeDate = trades[0].trade_date;

    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find((t) => t.security?.symbol === sym)?.security;
        const prices = await getHistoricalPrices(sym, earliestTradeDate, toDate, sec?.id, sec?.exchange);
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

    // ── Running cash ─────────────────────────────────────────────────────────
    const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let cash = 0;
    const cashEvents: [string, number][] = sortedTrades.map((t) => {
      const qty   = Number(t.quantity)  || 0;
      const price = Number(t.price)     || 0;
      const brok  = Number(t.brokerage) || 0;
      if      (t.trade_type === 'deposit')                          cash += price * qty;
      else if (t.trade_type === 'withdrawal')                       cash -= price * qty;
      else if (t.trade_type === 'buy' || t.trade_type === 'drp')  cash -= price * qty + brok;
      else if (t.trade_type === 'sell')                             cash += price * qty - brok;
      else if (t.trade_type === 'dividend')                         cash += price * qty;
      return [t.trade_date, cash] as [string, number];
    });
    const getCashAt = (date: string): number => {
      let val = 0;
      for (const [d, v] of cashEvents) { if (d <= date) val = v; else break; }
      return val;
    };

    // ── External flows by date (deposits/withdrawals only) ───────────────────
    const externalFlowsByDate: Record<string, number> = {};
    for (const t of sortedTrades) {
      const qty   = Number(t.quantity) || 0;
      const price = Number(t.price)    || 0;
      if (t.trade_type === 'deposit') {
        externalFlowsByDate[t.trade_date] = (externalFlowsByDate[t.trade_date] ?? 0) + price * qty;
      } else if (t.trade_type === 'withdrawal') {
        externalFlowsByDate[t.trade_date] = (externalFlowsByDate[t.trade_date] ?? 0) - price * qty;
      }
    }

    // ── Build last portfolio value per calendar month ─────────────────────────
    // (investedValue + cash) on the last price-available day of each month.
    const byMonth: Record<string, number> = {};  // YYYY-MM → last total value
    for (const date of Object.keys(priceMap).sort()) {
      const dayHoldings = calculateHoldings(trades.filter((t) => t.trade_date <= date) as any, priceMap[date]);
      const investedValue = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
      byMonth[date.slice(0, 7)] = investedValue + getCashAt(date);
    }

    // ── Net external flows per calendar month ────────────────────────────────
    const flowsByMonth: Record<string, number> = {};
    for (const [date, flow] of Object.entries(externalFlowsByDate)) {
      const m = date.slice(0, 7);
      flowsByMonth[m] = (flowsByMonth[m] ?? 0) + flow;
    }

    // ── Compute monthly P&L for months within the display range ──────────────
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months = Object.keys(byMonth).sort();
    const result = [];

    for (let i = 1; i < months.length; i++) {
      const m    = months[i]!;
      const prev = months[i - 1]!;
      if (m < fromDate.slice(0, 7) || m > toDate.slice(0, 7)) continue;

      const startValue = byMonth[prev]!;
      const endValue   = byMonth[m]!;
      const netFlow    = flowsByMonth[m] ?? 0;

      const profit     = endValue - startValue - netFlow;
      const denom      = startValue + netFlow * 0.5; // Modified Dietz denominator
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

// GET /api/portfolios/:id/reports/drawdown
// Returns daily rolling drawdown from the all-time peak (within history).
// drawdown is expressed as a negative percentage (0 = at peak, −20 = 20% below peak).
router.get('/:id/reports/drawdown', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const today = format(new Date(), 'yyyy-MM-dd');
  const { start_date, end_date } = req.query as Record<string, string>;
  const fromDate = start_date ?? '2000-01-01';
  const toDate   = end_date   ?? today;

  try {
    const trades = await getPortfolioTrades(id);
    if (!trades.length) { res.json([]); return; }

    const investmentTrades = trades.filter(
      (t) => t.trade_type !== 'deposit' && t.trade_type !== 'withdrawal',
    );
    const symbols = [...new Set(investmentTrades.filter((t) => t.security).map((t) => t.security!.symbol))];

    // Start from earliest investment trade so the rolling peak is accurate over
    // the full history, even if the user's display range starts later.
    const earliestTradeDate = investmentTrades.length
      ? investmentTrades.reduce((m, t) => (t.trade_date < m ? t.trade_date : m), investmentTrades[0].trade_date)
      : fromDate;

    const pricesBySymbol = await Promise.all(
      symbols.map(async (sym) => {
        const sec = trades.find((t) => t.security?.symbol === sym)?.security;
        const prices = await getHistoricalPrices(sym, earliestTradeDate, toDate, sec?.id, sec?.exchange);
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

    // Running cash (same pattern as performance route)
    const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let cash2 = 0;
    const cashEvents2: [string, number][] = sortedTrades.map((t) => {
      const qty   = Number(t.quantity)  || 0;
      const price = Number(t.price)     || 0;
      const brok  = Number(t.brokerage) || 0;
      if      (t.trade_type === 'deposit')                         cash2 += price * qty;
      else if (t.trade_type === 'withdrawal')                      cash2 -= price * qty;
      else if (t.trade_type === 'buy' || t.trade_type === 'drp') cash2 -= price * qty + brok;
      else if (t.trade_type === 'sell')                            cash2 += price * qty - brok;
      else if (t.trade_type === 'dividend')                        cash2 += price * qty;
      return [t.trade_date, cash2] as [string, number];
    });
    const getCash2At = (date: string): number => {
      let val = 0;
      for (const [d, v] of cashEvents2) { if (d <= date) val = v; else break; }
      return val;
    };

    // Rolling drawdown from peak — accumulate peak over full history,
    // but only emit data points within [fromDate, toDate].
    let peak = 0;
    const result: { date: string; drawdown: number }[] = [];

    for (const date of Object.keys(priceMap).sort()) {
      const dayHoldings = calculateHoldings(trades.filter((t) => t.trade_date <= date) as any, priceMap[date]);
      const investedValue = dayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
      const totalValue = investedValue + getCash2At(date);

      if (totalValue > peak) peak = totalValue;
      if (date < fromDate || date > toDate) continue;

      const drawdown = peak > 0 ? ((totalValue - peak) / peak) * 100 : 0;
      result.push({ date, drawdown });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/reports/capital-gains
// Returns CapitalGain[] — the frontend computes summary stats in-page.
// Field mapping: CgtLot → CapitalGain (hold_days→hold_period_days, etc.)
router.get('/:id/reports/capital-gains', async (req: AuthenticatedRequest, res: any) => {
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

    const gains = lots.map((l, idx) => ({
      id: `${l.symbol}-${l.buy_date}-${l.sell_date}-${idx}`,
      portfolio_id: id,
      symbol: l.symbol,
      security_name: l.security_name,
      buy_date: l.buy_date,
      sell_date: l.sell_date,
      hold_period_days: l.hold_days,
      quantity: l.quantity,
      cost_base: l.cost_base,
      proceeds: l.proceeds,
      gross_gain: l.gross_gain,
      cgt_discount_applicable: l.cgt_discount_eligible,
      cgt_discount_pct: l.gross_gain > 0 ? (l.cgt_discount_amount / l.gross_gain) * 100 : 0,
      net_gain: l.net_gain,
      is_long_term: l.hold_days >= 365,
    }));

    res.json(gains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/reports/tax
// Returns TaxReport shape matching the frontend TaxPage.
// Params: financial_year ("2024-2025" for jul-jun, "2024" for jan-dec), yearType.
router.get('/:id/reports/tax', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { financial_year, yearType } = req.query as Record<string, string>;
  const isJulJun = yearType === 'jul-jun';

  let fyStartDate: string, fyEndDate: string, fyLabel: string;
  if (isJulJun) {
    const parts = (financial_year ?? '').split('-').map(Number);
    const startYear = parts[0] ?? new Date().getFullYear() - 1;
    const endYear   = parts[1] ?? startYear + 1;
    fyStartDate = `${startYear}-07-01`;
    fyEndDate   = `${endYear}-06-30`;
    fyLabel = `FY ${startYear}–${endYear}`;
  } else {
    const year = parseInt(financial_year ?? String(new Date().getFullYear()), 10);
    fyStartDate = `${year}-01-01`;
    fyEndDate   = `${year}-12-31`;
    fyLabel = `CY ${year}`;
  }

  try {
    const trades = await getPortfolioTrades(id);
    const fyTrades = trades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);

    const totalDividends = fyTrades.filter(t => t.trade_type === 'dividend')
      .reduce((s, t) => s + Number(t.price) * Number(t.quantity), 0);
    const totalInterest = fyTrades.filter(t => t.trade_type === 'interest')
      .reduce((s, t) => s + Number(t.price) * Number(t.quantity), 0);

    // Use the unified fyStart/year params for calculateCapitalGains
    const fyStartParam: 'january' | 'july' = isJulJun ? 'july' : 'january';
    const yearParam = isJulJun
      ? parseInt(financial_year?.split('-')[1] ?? String(new Date().getFullYear()), 10)
      : parseInt(financial_year ?? String(new Date().getFullYear()), 10);

    const lots = calculateCapitalGains(trades as any, fyStartParam, yearParam);
    const shortTermGains  = lots.filter(l => !l.cgt_discount_eligible).reduce((s, l) => s + l.net_gain, 0);
    const longTermGrossGains = lots.filter(l => l.cgt_discount_eligible).reduce((s, l) => s + l.gross_gain, 0);
    const cgtDiscount     = lots.reduce((s, l) => s + l.cgt_discount_amount, 0);
    const longTermNetGains = lots.filter(l => l.cgt_discount_eligible).reduce((s, l) => s + l.net_gain, 0);

    const netCapGain = shortTermGains + longTermNetGains;

    res.json({
      financial_year: fyLabel,
      dividends_received: totalDividends,
      interest_received: totalInterest,
      capital_gains_short_term: shortTermGains,
      capital_gains_long_term: longTermGrossGains,
      cgt_discount_applied: cgtDiscount,
      total_taxable_income: totalDividends + totalInterest + Math.max(0, netCapGain),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/reports/dividends
// Returns DividendSummary: { dividends, total_dividends, total_interest, total_income }
// Params: start_date, end_date (from dateRangeToParams)
router.get('/:id/reports/dividends', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  const { start_date, end_date } = req.query as Record<string, string>;

  try {
    let query = supabase
      .from('trades')
      .select('*, security:securities(*)')
      .eq('portfolio_id', id)
      .in('trade_type', ['dividend', 'interest'])
      .order('trade_date', { ascending: false });

    if (start_date) query = query.gte('trade_date', start_date);
    if (end_date)   query = query.lte('trade_date', end_date);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    // Exclude synthetic CASH entries (deposits/withdrawals recorded as dividend/interest)
    const items = (data ?? []).filter((t: any) => t.security && t.security.symbol !== 'CASH');
    const dividends = items.filter((t: any) => t.trade_type === 'dividend');
    const interest  = items.filter((t: any) => t.trade_type === 'interest');

    const total_dividends = dividends.reduce((s: number, t: any) => s + t.price * t.quantity, 0);
    const total_interest  = interest.reduce((s: number, t: any) => s + t.price * t.quantity, 0);

    res.json({
      total_dividends,
      total_interest,
      total_income: total_dividends + total_interest,
      dividends: items.map((t: any) => ({
        id:             t.id,
        portfolio_id:   t.portfolio_id,
        symbol:         t.security?.symbol ?? '',
        security_name:  t.security?.name   ?? null,
        payment_date:   t.trade_date,
        amount:         t.price * t.quantity,
        currency:       t.currency ?? 'AUD',
        is_reinvested:  t.is_reinvested  ?? false,
        franking_pct:   t.franking_pct   ?? null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/reports/upcoming-dividends
// Estimates upcoming dividends based on the last dividend paid per holding.
router.get('/:id/reports/upcoming-dividends', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  try {
    const trades = await getPortfolioTrades(id);
    const today = format(new Date(), 'yyyy-MM-dd');

    // Find last dividend per symbol and estimate next payment
    const lastDiv: Record<string, { date: string; amount: number; currency: string; name: string | null }> = {};
    for (const t of trades) {
      if (t.trade_type !== 'dividend' || !t.security) continue;
      const sym = t.security.symbol;
      if (!lastDiv[sym] || t.trade_date > lastDiv[sym].date) {
        lastDiv[sym] = {
          date: t.trade_date,
          amount: t.price * t.quantity,
          currency: t.currency,
          name: t.security.name ?? null,
        };
      }
    }

    // Only include symbols that still have a non-zero holding
    const currentPrices = await getCurrentPrices(
      Object.keys(lastDiv).map(sym => ({ symbol: sym, exchange: '' }))
    );
    const holdings = calculateHoldings(trades as any, currentPrices);
    const activeSymbols = new Set(
      holdings.filter(h => h.quantity > 0).map(h => h.symbol)
    );

    const upcoming = [];
    for (const [sym, info] of Object.entries(lastDiv)) {
      if (!activeSymbols.has(sym)) continue;
      // Estimate next quarterly payment (~90 days after last)
      const lastDate = new Date(info.date);
      const expectedDate = new Date(lastDate.getTime() + 90 * 86400000);
      const expectedStr = format(expectedDate, 'yyyy-MM-dd');
      if (expectedStr <= today) continue; // already past
      upcoming.push({
        symbol: sym,
        security_name: info.name,
        expected_date: expectedStr,
        estimated_amount: info.amount,
        currency: info.currency,
        frequency: 'Quarterly',
      });
    }

    upcoming.sort((a, b) => a.expected_date.localeCompare(b.expected_date));
    const total_estimated = upcoming.reduce((s, d) => s + d.estimated_amount, 0);
    res.json({ dividends: upcoming, total_estimated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolios/:id/reports/diversity
// Returns PortfolioDiversity: { by_sector, by_investment_type, by_country, by_market }
router.get('/:id/reports/diversity', async (req: AuthenticatedRequest, res: any) => {
  const id = req.params.id as string;
  if (!(await verifyOwner(id, req.userId!))) { res.status(404).json({ error: 'Portfolio not found' }); return; }

  try {
    const trades = await getPortfolioTrades(id);

    // Build security metadata map from trades
    const secMeta: Record<string, { sector?: string|null; asset_type?: string|null; country?: string|null; exchange?: string|null }> = {};
    for (const t of trades) {
      if (t.security) {
        secMeta[t.security.symbol] = {
          sector:     t.security.sector,
          asset_type: t.security.asset_type,
          country:    t.security.country,
          exchange:   t.security.exchange,
        };
      }
    }

    // Lazily enrich securities that have no metadata yet (sector/country/asset_type all null).
    // Results are persisted back to the DB so future calls skip the Yahoo lookup entirely.
    const toEnrich = Object.entries(secMeta).filter(([, m]) => !m.sector && !m.asset_type && !m.country);
    if (toEnrich.length > 0) {
      await Promise.all(toEnrich.map(async ([sym, m]) => {
        const enriched = await enrichSecurityMetadata(sym, m.exchange);
        secMeta[sym] = { ...secMeta[sym], ...enriched };
        // Always persist (even partial) so we don't re-query on every request
        await supabase.from('securities').update(enriched).eq('symbol', sym.toUpperCase());
      }));
    }

    const securitiesMap = new Map<string, string>();
    trades.filter(t => t.security).forEach(t => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
    const currentPrices = await getCurrentPrices(
      Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange }))
    );
    const holdings = calculateHoldings(trades as any, currentPrices);

    const bySector: Record<string, number>  = {};
    const byType: Record<string, number>    = {};
    const byCountry: Record<string, number> = {};
    const byMarket: Record<string, number>  = {};

    for (const h of holdings) {
      const mv = h.market_value ?? 0;
      if (mv <= 0) continue;
      const m = secMeta[h.symbol] ?? {};
      const sector  = m.sector     || 'Other';
      const type    = m.asset_type || 'Other';
      const country = m.country    || 'Unknown';
      const market  = m.exchange   || 'Unknown';

      bySector[sector]   = (bySector[sector]   ?? 0) + mv;
      byType[type]       = (byType[type]        ?? 0) + mv;
      byCountry[country] = (byCountry[country]  ?? 0) + mv;
      byMarket[market]   = (byMarket[market]    ?? 0) + mv;
    }

    const total = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const toSlices = (obj: Record<string, number>) =>
      Object.entries(obj)
        .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);

    res.json({
      by_sector: toSlices(bySector),
      by_investment_type: toSlices(byType),
      by_country: toSlices(byCountry),
      by_market: toSlices(byMarket),
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
