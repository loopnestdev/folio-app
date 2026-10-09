import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { buildRebalanceResult } from '../services/rebalance/rebalance';
import type { AuthenticatedRequest } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

// ── Validation schemas ────────────────────────────────────────
const portfolioSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional().nullable(),
  investable_amount:   z.number().nonnegative().max(1e12).optional().nullable(),
  investable_currency: z.string().length(3).transform(s => s.toUpperCase()).optional(),
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

// POST /api/target-portfolios/:id/activate — make this the one active plan
router.post('/:id/activate', async (req: AuthenticatedRequest, res: any) => {
  try {
    // One active plan overall: clear every target portfolio and target group, then activate this one.
    // Separate updates leave a brief window with nothing active — acceptable for this use case.
    await Promise.all([
      supabase.from('target_portfolios').update({ is_active: false }).eq('user_id', req.userId!),
      supabase.from('target_portfolio_groups').update({ is_active: false }).eq('user_id', req.userId!),
    ]);

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
// GET /api/target-portfolios/:id/rebalance?portfolioId=xxx | groupId=xxx [&base=current|investable]
// A single target portfolio is rebalanced as a one-member plan at 100% (see services/rebalance).
// ═════════════════════════════════════════════════════════════
router.get('/:id/rebalance', async (req: AuthenticatedRequest, res: any) => {
  const q = (k: string) => { const v = req.query[k]; return (Array.isArray(v) ? v[0] : v) as string | undefined; };
  try {
    const tp = await getTargetPortfolio(req.params.id as string, req.userId!);
    if (!tp) { res.status(404).json({ error: 'Target portfolio not found' }); return; }

    const { status, body } = await buildRebalanceResult(
      req.userId!,
      {
        kind: 'portfolio', id: tp.id, name: tp.name, is_active: tp.is_active,
        investable_amount: tp.investable_amount ?? null, investable_currency: tp.investable_currency ?? 'USD',
        members: [{ target_portfolio_id: tp.id, name: tp.name, weight_pct: 100, items: tp.items }],
      },
      { portfolioId: q('portfolioId'), groupId: q('groupId'), base: q('base') },
    );
    res.status(status).json(body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
