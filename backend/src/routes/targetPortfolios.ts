import { Router } from 'express';
import { z } from 'zod';
import { format } from 'date-fns';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { calculateHoldings, calculateCashPosition } from '../services/calculations/holdings';
import { getCurrentPrices } from '../services/market-data/yahoo';
import type { AuthenticatedRequest, Trade } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

// ── Validation schemas ────────────────────────────────────────
const portfolioSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});

const itemSchema = z.object({
  symbol:         z.string().min(1).max(20).transform(s => s.toUpperCase()),
  exchange:       z.string().max(20).optional().nullable(),
  category:       z.string().max(50).optional().nullable(),
  allocation_pct: z.number().positive().max(100),
  sort_order:     z.number().int().optional(),
});

const itemsSchema = z.array(itemSchema);

// ── Helpers ───────────────────────────────────────────────────
async function getTargetPortfolio(id: string, userId: string) {
  const [{ data: tp }, { data: items }] = await Promise.all([
    supabase.from('target_portfolios').select('*').eq('id', id).eq('user_id', userId).single(),
    supabase.from('target_portfolio_items').select('*').eq('target_portfolio_id', id).order('sort_order', { ascending: true }),
  ]);
  if (!tp) return null;
  return { ...tp, items: items ?? [] };
}

// ═════════════════════════════════════════════════════════════
//  CRUD
// ═════════════════════════════════════════════════════════════

// GET /api/target-portfolios — list all with their items
router.get('/', async (req: AuthenticatedRequest, res: any) => {
  try {
    const [{ data: portfolios, error: pe }, { data: items, error: ie }] = await Promise.all([
      supabase.from('target_portfolios').select('*').eq('user_id', req.userId!).order('created_at', { ascending: true }),
      supabase.from('target_portfolio_items').select('*').eq('user_id', req.userId!).order('sort_order', { ascending: true }),
    ]);
    if (pe) { res.status(500).json({ error: pe.message }); return; }
    if (ie) { res.status(500).json({ error: ie.message }); return; }

    const result = (portfolios ?? []).map((p) => ({
      ...p,
      items: (items ?? []).filter((item) => item.target_portfolio_id === p.id),
    }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/target-portfolios — create new
router.post('/', async (req: AuthenticatedRequest, res: any) => {
  const body = portfolioSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('target_portfolios')
    .insert({ ...body.data, user_id: req.userId! })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ ...data, items: [] });
});

// GET /api/target-portfolios/:id — single with items
router.get('/:id', async (req: AuthenticatedRequest, res: any) => {
  try {
    const tp = await getTargetPortfolio(req.params.id as string, req.userId!);
    if (!tp) { res.status(404).json({ error: 'Target portfolio not found' }); return; }
    res.json(tp);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/target-portfolios/:id — update name / description
router.patch('/:id', async (req: AuthenticatedRequest, res: any) => {
  const body = portfolioSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('target_portfolios')
    .update(body.data)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Target portfolio not found' }); return; }
  res.json(data);
});

// DELETE /api/target-portfolios/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { error } = await supabase
    .from('target_portfolios')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// PUT /api/target-portfolios/:id/items — replace ALL items for a portfolio
router.put('/:id/items', async (req: AuthenticatedRequest, res: any) => {
  try {
    // Verify ownership first
    const { data: tp } = await supabase
      .from('target_portfolios')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .single();
    if (!tp) { res.status(404).json({ error: 'Target portfolio not found' }); return; }

    const body = itemsSchema.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

    // Delete existing then insert new (single round-trip replace)
    const { error: delErr } = await supabase
      .from('target_portfolio_items')
      .delete()
      .eq('target_portfolio_id', req.params.id);
    if (delErr) { res.status(500).json({ error: delErr.message }); return; }

    if (body.data.length === 0) { res.json([]); return; }

    const { data, error: insErr } = await supabase
      .from('target_portfolio_items')
      .insert(
        body.data.map((item, idx) => ({
          ...item,
          target_portfolio_id: req.params.id,
          user_id:             req.userId!,
          sort_order:          item.sort_order ?? idx,
        })),
      )
      .select();
    if (insErr) { res.status(500).json({ error: insErr.message }); return; }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/target-portfolios/:id/activate — set as the one active portfolio
router.post('/:id/activate', async (req: AuthenticatedRequest, res: any) => {
  try {
    // Deactivate all, then activate the target (two separate updates to avoid
    // a race where no portfolio is active between steps — acceptable for this use case).
    await supabase
      .from('target_portfolios')
      .update({ is_active: false })
      .eq('user_id', req.userId!);

    const { data, error } = await supabase
      .from('target_portfolios')
      .update({ is_active: true })
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .select()
      .single();
    if (error || !data) { res.status(404).json({ error: 'Target portfolio not found' }); return; }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  REBALANCE ANALYSIS
// GET /api/target-portfolios/:id/rebalance?portfolioId=xxx
// ═════════════════════════════════════════════════════════════
router.get('/:id/rebalance', async (req: AuthenticatedRequest, res: any) => {
  const rawPortfolioId = req.query['portfolioId'];
  const portfolioId = Array.isArray(rawPortfolioId) ? rawPortfolioId[0] : rawPortfolioId;
  if (!portfolioId) {
    res.status(400).json({ error: 'portfolioId query param is required' });
    return;
  }

  try {
    // Verify target portfolio ownership
    const tp = await getTargetPortfolio(req.params.id as string, req.userId!);
    if (!tp) { res.status(404).json({ error: 'Target portfolio not found' }); return; }

    // Verify actual portfolio ownership
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .eq('user_id', req.userId!)
      .single();
    if (!portfolio) { res.status(404).json({ error: 'Portfolio not found' }); return; }

    // Load all trades with security info
    const { data: tradeRows, error: tradeErr } = await supabase
      .from('trades')
      .select('*, security:securities(*)')
      .eq('portfolio_id', portfolioId)
      .order('trade_date', { ascending: true });
    if (tradeErr) { res.status(500).json({ error: tradeErr.message }); return; }
    const trades = (tradeRows ?? []) as Trade[];

    // Current prices for all symbols ever traded
    const securitiesMap = new Map<string, string>();
    trades
      .filter((t) => t.security)
      .forEach((t) => securitiesMap.set(t.security!.symbol, t.security!.exchange ?? ''));
    const currentPrices = await getCurrentPrices(
      Array.from(securitiesMap.entries()).map(([symbol, exchange]) => ({ symbol, exchange })),
    );

    // Current holdings + cash
    const holdings     = calculateHoldings(trades as any, currentPrices);
    const { cash_balance } = calculateCashPosition(trades as any);
    const investedValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0);
    const totalValue    = investedValue + cash_balance;

    const todayMs = Date.now();

    // Map symbol → holding data
    const currentBySymbol: Record<string, {
      market_value: number;
      current_price: number | null;
      unrealized_gain: number | null;
    }> = {};
    for (const h of holdings) {
      currentBySymbol[h.symbol] = {
        market_value:    h.market_value    ?? 0,
        current_price:   h.current_price,
        unrealized_gain: h.unrealized_gain,
      };
    }

    // ── CGT estimator for open positions ─────────────────────
    // Simulates selling `sellValue` worth of `symbol` from remaining FIFO lots
    // and splits the estimated gain into short-term (<365d) and long-term (≥365d).
    function estimateOpenCgt(
      symbol: string,
      sellValue: number,
      currentPrice: number | null,
    ): { shortTermGain: number; longTermGain: number } {
      if (!currentPrice || currentPrice <= 0 || sellValue <= 0) {
        return { shortTermGain: 0, longTermGain: 0 };
      }
      const sellQty = sellValue / currentPrice;

      // Build FIFO queue of buys
      const buys = trades
        .filter(
          (t) =>
            t.security?.symbol === symbol &&
            (t.trade_type === 'buy' || t.trade_type === 'drp'),
        )
        .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

      interface Lot { date: string; qty: number; unitCost: number }
      const fifo: Lot[] = buys.map((b) => ({
        date:     b.trade_date,
        qty:      b.quantity,
        unitCost: b.price,
      }));

      // Consume past sells from the front of the queue (FIFO)
      let pastSells = trades
        .filter((t) => t.security?.symbol === symbol && t.trade_type === 'sell')
        .reduce((s, t) => s + t.quantity, 0);

      for (const lot of fifo) {
        if (pastSells <= 0) break;
        const consumed = Math.min(lot.qty, pastSells);
        lot.qty    -= consumed;
        pastSells  -= consumed;
      }

      // Simulate the proposed sell
      let shortTermGain = 0;
      let longTermGain  = 0;
      let remaining     = sellQty;

      for (const lot of fifo) {
        if (lot.qty <= 0 || remaining <= 0) continue;
        const sold     = Math.min(lot.qty, remaining);
        const proceeds = sold * currentPrice;
        const cost     = sold * lot.unitCost;
        const gain     = proceeds - cost;
        const holdDays = (todayMs - new Date(lot.date).getTime()) / 86_400_000;

        if (holdDays >= 365) longTermGain  += gain;
        else                 shortTermGain += gain;
        remaining -= sold;
      }

      return { shortTermGain, longTermGain };
    }

    // ── Build rebalance rows ──────────────────────────────────
    // Tolerance: ±1% of total portfolio value counts as "HOLD"
    const toleranceAbs = totalValue * 0.01;

    type Action  = 'BUY' | 'SELL' | 'HOLD' | 'EXIT';
    type TaxTier = 'long_term' | 'short_term' | 'loss' | 'none';

    interface RebalanceRow {
      symbol:         string;
      category:       string | null;
      sort_order:     number;
      allocation_pct: number;
      target_value:   number;
      current_value:  number;
      current_price:  number | null;
      diff:           number;
      action:         Action;
      short_term_gain: number;
      long_term_gain:  number;
      tax_tier:        TaxTier;
    }

    const rows: RebalanceRow[] = [];
    const targetSymbols = new Set<string>((tp.items ?? []).map((i: any) => i.symbol as string));

    // One row per target item
    for (const item of (tp.items ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      const targetValue  = totalValue * (item.allocation_pct / 100);
      const cur          = currentBySymbol[item.symbol];
      const currentValue = cur?.market_value ?? 0;
      const diff         = targetValue - currentValue;

      let action: Action = 'HOLD';
      if      (diff >  toleranceAbs) action = 'BUY';
      else if (diff < -toleranceAbs) action = 'SELL';

      let shortTermGain = 0;
      let longTermGain  = 0;
      let taxTier: TaxTier = 'none';

      if (action === 'SELL' && cur) {
        const cgt = estimateOpenCgt(item.symbol, Math.abs(diff), cur.current_price);
        shortTermGain = cgt.shortTermGain;
        longTermGain  = cgt.longTermGain;
        const totalGain = shortTermGain + longTermGain;
        if      (totalGain < 0)          taxTier = 'loss';
        else if (longTermGain >= shortTermGain) taxTier = 'long_term';
        else                              taxTier = 'short_term';
      }

      rows.push({
        symbol:         item.symbol,
        category:       item.category ?? null,
        sort_order:     item.sort_order ?? 0,
        allocation_pct: item.allocation_pct,
        target_value:   targetValue,
        current_value:  currentValue,
        current_price:  cur?.current_price ?? null,
        diff,
        action,
        short_term_gain: shortTermGain,
        long_term_gain:  longTermGain,
        tax_tier:        taxTier,
      });
    }

    // EXIT rows — holdings present but not in the target
    for (const h of holdings) {
      if (h.symbol === 'CASH' || targetSymbols.has(h.symbol)) continue;
      const currentValue = h.market_value ?? 0;
      if (currentValue <= 0) continue;

      const cgt = estimateOpenCgt(h.symbol, currentValue, h.current_price);
      const totalGain = cgt.shortTermGain + cgt.longTermGain;
      const taxTier: TaxTier =
        totalGain < 0              ? 'loss'       :
        cgt.longTermGain >= cgt.shortTermGain ? 'long_term' :
        'short_term';

      rows.push({
        symbol:         h.symbol,
        category:       null,
        sort_order:     9999,
        allocation_pct: 0,
        target_value:   0,
        current_value:  currentValue,
        current_price:  h.current_price,
        diff:           -currentValue,
        action:         'EXIT',
        short_term_gain: cgt.shortTermGain,
        long_term_gain:  cgt.longTermGain,
        tax_tier:        taxTier,
      });
    }

    // ── Tax summary ───────────────────────────────────────────
    const sellRows       = rows.filter((r) => r.action === 'SELL' || r.action === 'EXIT');
    const totalStGain    = sellRows.reduce((s, r) => s + r.short_term_gain, 0);
    const totalLtGain    = sellRows.reduce((s, r) => s + r.long_term_gain,  0);
    // SMSF accumulation phase: 15% flat, 1/3 discount on long-term gains (≡ 10% effective)
    const estTaxSt = Math.max(0, totalStGain) * 0.15;
    const estTaxLt = Math.max(0, totalLtGain) * (2 / 3) * 0.15;

    // Recommended sell order for least CGT:
    //   1. Losses first (crystallise to offset other gains)
    //   2. Long-term gains (CGT discount applies → cheaper)
    //   3. Short-term gains (full rate → most expensive)
    const lossSymbols     = sellRows.filter((r) => r.tax_tier === 'loss').map((r) => r.symbol);
    const ltGainSymbols   = sellRows.filter((r) => r.tax_tier === 'long_term').map((r) => r.symbol);
    const stGainSymbols   = sellRows.filter((r) => r.tax_tier === 'short_term').map((r) => r.symbol);

    res.json({
      target_portfolio: { id: tp.id, name: tp.name, is_active: tp.is_active },
      portfolio:        { id: portfolio.id, name: portfolio.name, currency: portfolio.currency },
      total_value:      totalValue,
      cash_balance,
      invested_value:   investedValue,
      rows,
      tax_summary: {
        total_short_term_gain:     totalStGain,
        total_long_term_gain:      totalLtGain,
        estimated_tax_short_term:  estTaxSt,
        estimated_tax_long_term:   estTaxLt,
        estimated_tax_total:       estTaxSt + estTaxLt,
        sell_order: {
          loss_symbols:       lossSymbols,
          long_term_symbols:  ltGainSymbols,
          short_term_symbols: stGainSymbols,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
