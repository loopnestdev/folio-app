import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { calculateHoldings, calculateCashPosition } from '../calculations/holdings';
import { getCurrentPrices, getForexRate } from '../market-data/yahoo';
import type { Trade } from '../../types';

// ── Types ─────────────────────────────────────────────────────

export interface TargetItemInput {
  symbol: string;
  exchange: string | null;
  category: string | null;
  allocation_pct: number;
  sort_order: number;
}

export interface TargetMemberInput {
  target_portfolio_id: string;
  name: string;
  weight_pct: number;
  items: TargetItemInput[];
}

export interface TargetSource {
  target_portfolio_id: string;
  name: string;
  weight_pct: number;
  item_pct: number;
}

/** One stock's share of the whole plan, after applying member weights. */
export interface TargetLine {
  symbol: string;
  exchange: string | null;
  category: string | null;
  allocation_pct: number;
  sort_order: number;
  sources: TargetSource[];
}

/** A real holding being compared, valued in the comparison currency. */
export interface ComparisonHolding {
  symbol: string;
  market_value: number;
  /** Native-currency price, used to turn a sell amount into a share count for the CGT estimate. */
  current_price: number | null;
  /** Comparison-currency units per native unit. */
  fx: number;
  trades: Trade[];
}

export type RebalanceAction = 'BUY' | 'SELL' | 'HOLD' | 'EXIT';
export type TaxTier = 'long_term' | 'short_term' | 'loss' | 'none';

export interface RebalanceRow {
  symbol: string;
  category: string | null;
  sort_order: number;
  allocation_pct: number;
  target_value: number;
  current_value: number;
  current_price: number | null;
  diff: number;
  action: RebalanceAction;
  short_term_gain: number;
  long_term_gain: number;
  tax_tier: TaxTier;
  sources: TargetSource[];
}

// ── Target merging ────────────────────────────────────────────

/**
 * combineTargets:
 *   - Turns weighted members into one allocation per stock: effective % = member weight % x item % / 100
 *   - A stock in several members is merged into one line (percentages added, every source kept), keyed by symbol like the rest of the app
 *   - A single target portfolio is just one member at 100%
 *   - Lines keep the first-seen category and order: member order first, then item order
 */
export function combineTargets(members: TargetMemberInput[]): TargetLine[] {
  const bySymbol = new Map<string, TargetLine>();
  let order = 0;
  for (const m of members) {
    const items = [...m.items].sort((a, b) => a.sort_order - b.sort_order);
    for (const item of items) {
      const pct = (m.weight_pct * item.allocation_pct) / 100;
      const source: TargetSource = { target_portfolio_id: m.target_portfolio_id, name: m.name, weight_pct: m.weight_pct, item_pct: item.allocation_pct };
      const existing = bySymbol.get(item.symbol);
      if (existing) {
        existing.allocation_pct += pct;
        existing.sources.push(source);
        existing.category ??= item.category;
        existing.exchange ??= item.exchange;
      } else {
        bySymbol.set(item.symbol, {
          symbol: item.symbol,
          exchange: item.exchange,
          category: item.category,
          allocation_pct: pct,
          sort_order: order++,
          sources: [source],
        });
      }
    }
  }
  return [...bySymbol.values()].map((l) => ({ ...l, allocation_pct: Math.round(l.allocation_pct * 10000) / 10000 }));
}

// ── CGT estimate ──────────────────────────────────────────────

/**
 * estimateOpenCgt:
 *   - Simulates selling `sellValue` (comparison currency) of a holding from its remaining FIFO lots
 *   - Splits the estimated gain into short-term (< 365 days) and long-term, converted to the comparison currency
 *   - For a real group, a symbol held in several accounts is treated as one FIFO queue (an approximation; brokers match per account)
 */
export function estimateOpenCgt(holding: ComparisonHolding, sellValue: number, todayMs = Date.now()): { shortTermGain: number; longTermGain: number } {
  const price = holding.current_price;
  if (!price || price <= 0 || sellValue <= 0 || holding.fx <= 0) return { shortTermGain: 0, longTermGain: 0 };
  const sellQty = sellValue / holding.fx / price;

  const lots = holding.trades
    .filter((t) => t.trade_type === 'buy' || t.trade_type === 'drp')
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
    .map((b) => ({ date: b.trade_date, qty: b.quantity, unitCost: b.price }));

  let pastSells = holding.trades.filter((t) => t.trade_type === 'sell').reduce((s, t) => s + t.quantity, 0);
  for (const lot of lots) {
    if (pastSells <= 0) break;
    const consumed = Math.min(lot.qty, pastSells);
    lot.qty -= consumed;
    pastSells -= consumed;
  }

  let shortTermGain = 0, longTermGain = 0, remaining = sellQty;
  for (const lot of lots) {
    if (lot.qty <= 0 || remaining <= 0) continue;
    const sold = Math.min(lot.qty, remaining);
    const gain = sold * (price - lot.unitCost) * holding.fx;
    const holdDays = (todayMs - new Date(lot.date).getTime()) / 86_400_000;
    if (holdDays >= 365) longTermGain += gain;
    else shortTermGain += gain;
    remaining -= sold;
  }
  return { shortTermGain, longTermGain };
}

const taxTierOf = (st: number, lt: number): TaxTier =>
  st + lt < 0 ? 'loss' : lt >= st ? 'long_term' : 'short_term';

// ── Rows ──────────────────────────────────────────────────────

/**
 * buildRebalanceRows:
 *   - One row per target line: target = baseValue x effective %, BUY / SELL beyond a tolerance of 1% of baseValue, HOLD within it
 *   - One EXIT row per real holding that is not in the plan (the CASH placeholder is ignored)
 *   - baseValue is the comparison's current total value, or the saved investable amount (converted), depending on the chosen base
 */
export function buildRebalanceRows(targets: TargetLine[], holdings: ComparisonHolding[], baseValue: number, todayMs = Date.now()): RebalanceRow[] {
  const tolerance = baseValue * 0.01;
  const held = new Map(holdings.map((h) => [h.symbol, h]));
  const rows: RebalanceRow[] = [];

  for (const t of [...targets].sort((a, b) => a.sort_order - b.sort_order)) {
    const h = held.get(t.symbol);
    const targetValue = baseValue * (t.allocation_pct / 100);
    const currentValue = h?.market_value ?? 0;
    const diff = targetValue - currentValue;
    const action: RebalanceAction = diff > tolerance ? 'BUY' : diff < -tolerance ? 'SELL' : 'HOLD';
    let st = 0, lt = 0, tier: TaxTier = 'none';
    if (action === 'SELL' && h) {
      ({ shortTermGain: st, longTermGain: lt } = estimateOpenCgt(h, -diff, todayMs));
      tier = taxTierOf(st, lt);
    }
    rows.push({
      symbol: t.symbol, category: t.category, sort_order: t.sort_order, allocation_pct: t.allocation_pct,
      target_value: targetValue, current_value: currentValue, current_price: h?.current_price ?? null,
      diff, action, short_term_gain: st, long_term_gain: lt, tax_tier: tier, sources: t.sources,
    });
  }

  const planned = new Set(targets.map((t) => t.symbol));
  for (const h of holdings) {
    if (h.symbol === 'CASH' || planned.has(h.symbol) || h.market_value <= 0) continue;
    const { shortTermGain: st, longTermGain: lt } = estimateOpenCgt(h, h.market_value, todayMs);
    rows.push({
      symbol: h.symbol, category: null, sort_order: 9999, allocation_pct: 0,
      target_value: 0, current_value: h.market_value, current_price: h.current_price,
      diff: -h.market_value, action: 'EXIT', short_term_gain: st, long_term_gain: lt, tax_tier: taxTierOf(st, lt), sources: [],
    });
  }
  return rows;
}

/**
 * taxSummary:
 *   - Totals estimated gains on every SELL / EXIT row
 *   - SMSF accumulation phase: 15% flat, with a 1/3 discount on long-term gains (10% effective)
 *   - Recommended sell order for least CGT: losses first, then long-term gains, then short-term gains
 */
export function taxSummary(rows: RebalanceRow[]) {
  const sells = rows.filter((r) => r.action === 'SELL' || r.action === 'EXIT');
  const st = sells.reduce((s, r) => s + r.short_term_gain, 0);
  const lt = sells.reduce((s, r) => s + r.long_term_gain, 0);
  const taxSt = Math.max(0, st) * 0.15;
  const taxLt = Math.max(0, lt) * (2 / 3) * 0.15;
  return {
    total_short_term_gain: st,
    total_long_term_gain: lt,
    estimated_tax_short_term: taxSt,
    estimated_tax_long_term: taxLt,
    estimated_tax_total: taxSt + taxLt,
    sell_order: {
      loss_symbols: sells.filter((r) => r.tax_tier === 'loss').map((r) => r.symbol),
      long_term_symbols: sells.filter((r) => r.tax_tier === 'long_term').map((r) => r.symbol),
      short_term_symbols: sells.filter((r) => r.tax_tier === 'short_term').map((r) => r.symbol),
    },
  };
}

// ── Comparison loading (database + market data) ───────────────

export interface Comparison {
  kind: 'portfolio' | 'group';
  id: string;
  name: string;
  currency: string;
  total_value: number;
  cash_balance: number;
  invested_value: number;
  holdings: ComparisonHolding[];
}

/**
 * loadComparison:
 *   - The real side of a rebalance: one portfolio in its own currency, or a real portfolio group converted to its base currency at today's FX rate
 *   - Returns null when the portfolio / group does not belong to the user
 */
export async function loadComparison(userId: string, ref: { portfolioId?: string; groupId?: string }): Promise<Comparison | null> {
  let kind: Comparison['kind'];
  let id: string, name: string, currency: string;
  let portfolios: { id: string; currency: string }[];

  if (ref.groupId) {
    const { data: group } = await supabase.from('portfolio_groups').select('*').eq('id', ref.groupId).eq('user_id', userId).single();
    if (!group) return null;
    const { data: members } = await supabase.from('portfolios').select('id, currency').eq('group_id', ref.groupId).eq('user_id', userId);
    kind = 'group'; id = group.id; name = group.name; currency = group.base_currency ?? 'AUD';
    portfolios = members ?? [];
  } else if (ref.portfolioId) {
    const { data: p } = await supabase.from('portfolios').select('*').eq('id', ref.portfolioId).eq('user_id', userId).single();
    if (!p) return null;
    kind = 'portfolio'; id = p.id; name = p.name; currency = p.currency;
    portfolios = [{ id: p.id, currency: p.currency }];
  } else {
    return null;
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const bySymbol = new Map<string, ComparisonHolding>();
  let cash = 0, invested = 0;

  for (const p of portfolios) {
    const fx = p.currency === currency ? 1 : await getForexRate(p.currency, currency, today);
    const { data: rows, error } = await supabase
      .from('trades').select('*, security:securities(*)').eq('portfolio_id', p.id).order('trade_date', { ascending: true });
    if (error) throw new Error(error.message);
    const trades = (rows ?? []) as Trade[];

    const secs = new Map<string, string>();
    trades.filter((t) => t.security).forEach((t) => secs.set(t.security!.symbol, t.security!.exchange ?? ''));
    const prices = await getCurrentPrices([...secs.entries()].map(([symbol, exchange]) => ({ symbol, exchange })));

    const holdings = calculateHoldings(trades as any, prices);
    cash += calculateCashPosition(trades as any).cash_balance * fx;
    for (const h of holdings) {
      const value = (h.market_value ?? 0) * fx;
      invested += value;
      const symTrades = trades.filter((t) => t.security?.symbol === h.symbol);
      const existing = bySymbol.get(h.symbol);
      if (existing) {
        existing.market_value += value;
        existing.trades.push(...symTrades);
      } else {
        bySymbol.set(h.symbol, { symbol: h.symbol, market_value: value, current_price: h.current_price, fx, trades: symTrades });
      }
    }
  }

  return { kind, id, name, currency, total_value: invested + cash, cash_balance: cash, invested_value: invested, holdings: [...bySymbol.values()] };
}

// ── Response ──────────────────────────────────────────────────

export interface RebalanceTarget {
  kind: 'portfolio' | 'group';
  id: string;
  name: string;
  is_active: boolean;
  investable_amount: number | null;
  investable_currency: string;
  members: TargetMemberInput[];
}

export type RebalanceBase = 'current' | 'investable';

/**
 * buildRebalanceResult:
 *   - Shared by GET /api/target-portfolios/:id/rebalance and GET /api/target-portfolio-groups/:id/rebalance
 *   - base 'current': targets are sized from the comparison's current total value (self-funding, as before)
 *   - base 'investable': targets are sized from the saved investable amount, converted to the comparison currency at today's rate; buys can then exceed available cash
 *   - Returns an HTTP status and body so routes stay thin
 */
export async function buildRebalanceResult(
  userId: string,
  target: RebalanceTarget,
  query: { portfolioId?: string; groupId?: string; base?: string },
): Promise<{ status: number; body: unknown }> {
  if (!query.portfolioId && !query.groupId) return { status: 400, body: { error: 'portfolioId or groupId query param is required' } };
  const base: RebalanceBase = query.base === 'investable' ? 'investable' : 'current';
  if (base === 'investable' && !(Number(target.investable_amount) > 0)) {
    return { status: 400, body: { error: 'No investable amount saved for this target. Save one, or rebalance against current value.' } };
  }

  const comparison = await loadComparison(userId, query);
  if (!comparison) return { status: 404, body: { error: query.groupId ? 'Portfolio group not found' : 'Portfolio not found' } };

  let fx = 1, baseValue = comparison.total_value;
  if (base === 'investable') {
    fx = target.investable_currency === comparison.currency
      ? 1
      : await getForexRate(target.investable_currency, comparison.currency, format(new Date(), 'yyyy-MM-dd'));
    baseValue = Number(target.investable_amount) * fx;
  }

  const targets = combineTargets(target.members);
  const rows = buildRebalanceRows(targets, comparison.holdings, baseValue);
  const plannedPct = targets.reduce((s, t) => s + t.allocation_pct, 0);

  return {
    status: 200,
    body: {
      target: { kind: target.kind, id: target.id, name: target.name, is_active: target.is_active },
      // Kept for older frontends; same as `target` for a single target portfolio
      target_portfolio: { id: target.id, name: target.name, is_active: target.is_active },
      comparison: { kind: comparison.kind, id: comparison.id, name: comparison.name, currency: comparison.currency },
      portfolio: { id: comparison.id, name: comparison.name, currency: comparison.currency },
      base,
      base_value: baseValue,
      investable_amount: target.investable_amount != null ? Number(target.investable_amount) : null,
      investable_currency: target.investable_currency,
      investable_fx_rate: fx,
      planned_pct: Math.round(plannedPct * 100) / 100,
      total_value: comparison.total_value,
      cash_balance: comparison.cash_balance,
      invested_value: comparison.invested_value,
      rows,
      tax_summary: taxSummary(rows),
    },
  };
}
