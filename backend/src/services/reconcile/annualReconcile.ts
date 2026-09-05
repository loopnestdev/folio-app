import type { ParsedTrade } from '../../types';

export interface ReconcileEntry {
  date: string;
  type: string;
  symbol: string;
  qty: number;
  amount: number; // native currency
}

export interface ReconcileDateShift extends ReconcileEntry {
  database_date: string;
  moomoo_date: string;
  days_diff: number;
}

export interface PortfolioReconcileResult {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_currency: string;
  window_start: string | null;
  window_end: string | null;
  moomoo_entry_count: number;
  database_entry_count: number;
  matched_count: number;
  date_shifted: ReconcileDateShift[];
  missing_from_database: ReconcileEntry[];
  unexpected_in_database: ReconcileEntry[];
  is_clean: boolean;
}

interface DbTradeInput {
  trade_date: string;
  trade_type: string;
  quantity: number;
  price: number;
  security?: { symbol: string } | null;
}

// Trade types the annual summary file can represent at all. DB trades of any
// other type (other_income, drp, split, transfer_in) are excluded from
// comparison — the file has no section that could ever report them, so
// flagging them would just be permanent, unfixable noise.
const COMPARABLE_TYPES = new Set(['buy', 'sell', 'dividend', 'interest', 'deposit', 'withdrawal']);

// Only buy/sell quantities are directly comparable between the two sources.
// Dividends/interest/deposits/withdrawals use inconsistent quantity
// conventions (the database stores a dividend as qty=1 x total price; Moomoo's
// file stores actual share count x per-unit price) — for those, only the
// dollar amount is meaningful to compare.
const QTY_COMPARABLE_TYPES = new Set(['buy', 'sell']);

// Moomoo's annual export appears to timestamp some early-AEST-morning events
// (FX transfers, trades placed right around midnight local time) a calendar
// day earlier than the monthly statements it's derived from — consistent
// with an internal UTC vs. AEST discrepancy in Moomoo's own reporting. A
// small date tolerance absorbs this without masking a genuine date error.
const DATE_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE_FLAT = 0.5;
const AMOUNT_TOLERANCE_PCT = 0.005;

function dayDiff(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function amountsMatch(a: number, b: number, reference: number): boolean {
  const diff = Math.abs(Math.abs(a) - Math.abs(b));
  return diff <= Math.max(AMOUNT_TOLERANCE_FLAT, Math.abs(reference) * AMOUNT_TOLERANCE_PCT);
}

/**
 * Compares one portfolio's saved trades against the subset of a Moomoo
 * annual "Financial Year Summary" export that belongs to that portfolio's
 * currency. Matching is tolerant of the display-rounding and timezone
 * artifacts documented above so that only genuine discrepancies are
 * reported — see the manual reconciliation this formalizes for how those
 * tolerances were derived and validated against a real file.
 */
export function reconcilePortfolio(
  portfolio: { id: string; name: string; currency: string },
  dbTrades: DbTradeInput[],
  moomooTrades: ParsedTrade[],
): PortfolioReconcileResult {
  const moo = moomooTrades
    .filter((t) => t.currency.toUpperCase() === portfolio.currency.toUpperCase())
    .filter((t) => COMPARABLE_TYPES.has(t.trade_type))
    .map((t) => ({ date: t.trade_date, type: t.trade_type, symbol: t.symbol.toUpperCase(), qty: t.quantity, amount: t.amount }));

  const mooDates = moo.map((m) => m.date).sort();
  const windowStart = mooDates[0] ?? null;
  const windowEnd = mooDates[mooDates.length - 1] ?? null;

  const db = dbTrades
    .filter((t) => COMPARABLE_TYPES.has(t.trade_type))
    .filter((t) => !windowStart || !windowEnd ||
      (t.trade_date >= addDays(windowStart, -DATE_TOLERANCE_DAYS) && t.trade_date <= addDays(windowEnd, DATE_TOLERANCE_DAYS)))
    .map((t) => ({
      date: t.trade_date,
      type: t.trade_type,
      symbol: (t.security?.symbol ?? 'CASH').toUpperCase(),
      qty: t.quantity,
      amount: t.quantity * t.price,
    }));

  const mooPool = moo.map((m, idx) => ({ ...m, idx, used: false }));
  const dateShifted: ReconcileDateShift[] = [];
  const unexpectedInDatabase: ReconcileEntry[] = [];
  let matchedCount = 0;

  for (const d of db) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (const m of mooPool) {
      if (m.used) continue;
      if (m.type !== d.type || m.symbol !== d.symbol) continue;
      if (QTY_COMPARABLE_TYPES.has(d.type) && Math.abs(m.qty - d.qty) > 0.001) continue;
      const dd = dayDiff(m.date, d.date);
      if (dd > DATE_TOLERANCE_DAYS) continue;
      if (!amountsMatch(m.amount, d.amount, d.amount)) continue;
      if (dd < bestDiff) { bestDiff = dd; bestIdx = m.idx; }
    }
    if (bestIdx === -1) {
      unexpectedInDatabase.push(d);
    } else {
      mooPool[bestIdx].used = true;
      matchedCount++;
      if (bestDiff > 0.5) {
        dateShifted.push({
          ...d,
          database_date: d.date,
          moomoo_date: mooPool[bestIdx].date,
          days_diff: Math.round(bestDiff),
        });
      }
    }
  }

  const missingFromDatabase: ReconcileEntry[] = mooPool
    .filter((m) => !m.used)
    .map((m) => ({ date: m.date, type: m.type, symbol: m.symbol, qty: m.qty, amount: m.amount }));

  return {
    portfolio_id: portfolio.id,
    portfolio_name: portfolio.name,
    portfolio_currency: portfolio.currency,
    window_start: windowStart,
    window_end: windowEnd,
    moomoo_entry_count: moo.length,
    database_entry_count: db.length,
    matched_count: matchedCount,
    date_shifted: dateShifted,
    missing_from_database: missingFromDatabase,
    unexpected_in_database: unexpectedInDatabase,
    is_clean: missingFromDatabase.length === 0 && unexpectedInDatabase.length === 0,
  };
}
