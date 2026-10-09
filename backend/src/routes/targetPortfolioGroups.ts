import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { buildRebalanceResult, type TargetMemberInput } from '../services/rebalance/rebalance';
import type { AuthenticatedRequest } from '../types';

// Target portfolio groups: several target portfolios, each weighted as a % of the group,
// with a saved investable amount. Mounted at /api/target-portfolio-groups.
const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

// ── Validation schemas ────────────────────────────────────────
const groupSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional().nullable(),
  investable_amount:   z.number().nonnegative().max(1e12).optional().nullable(),
  investable_currency: z.string().length(3).transform(s => s.toUpperCase()).optional(),
});

const membersSchema = z.array(z.object({
  target_portfolio_id: z.string().uuid(),
  weight_pct:          z.number().positive().max(100),
  sort_order:          z.number().int().optional(),
})).refine(
  (ms) => new Set(ms.map((m) => m.target_portfolio_id)).size === ms.length,
  { message: 'A target portfolio can only appear once in a group' },
);

// ── Helpers ───────────────────────────────────────────────────
async function listGroups(userId: string, id?: string) {
  let gq = supabase.from('target_portfolio_groups').select('*').eq('user_id', userId).order('created_at', { ascending: true });
  let mq = supabase.from('target_portfolio_group_members').select('*').eq('user_id', userId).order('sort_order', { ascending: true });
  if (id) { gq = gq.eq('id', id); mq = mq.eq('group_id', id); }
  const [{ data: groups, error: ge }, { data: members, error: me }] = await Promise.all([gq, mq]);
  if (ge) throw new Error(ge.message);
  if (me) throw new Error(me.message);
  return (groups ?? []).map((g) => ({ ...g, members: (members ?? []).filter((m) => m.group_id === g.id) }));
}

// ═════════════════════════════════════════════════════════════
//  CRUD
// ═════════════════════════════════════════════════════════════

// GET /api/target-portfolio-groups — all groups with their members
router.get('/', async (req: AuthenticatedRequest, res: any) => {
  try {
    res.json(await listGroups(req.userId!));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/target-portfolio-groups — create
router.post('/', async (req: AuthenticatedRequest, res: any) => {
  const body = groupSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const { data, error } = await supabase
    .from('target_portfolio_groups')
    .insert({ ...body.data, user_id: req.userId! })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ ...data, members: [] });
});

// GET /api/target-portfolio-groups/:id — single with members
router.get('/:id', async (req: AuthenticatedRequest, res: any) => {
  try {
    const [group] = await listGroups(req.userId!, req.params.id as string);
    if (!group) { res.status(404).json({ error: 'Target group not found' }); return; }
    res.json(group);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/target-portfolio-groups/:id — name / description / investable amount
router.patch('/:id', async (req: AuthenticatedRequest, res: any) => {
  const body = groupSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const { data, error } = await supabase
    .from('target_portfolio_groups')
    .update(body.data)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Target group not found' }); return; }
  res.json(data);
});

// DELETE /api/target-portfolio-groups/:id — removes the group and its memberships, not the target portfolios
router.delete('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { error } = await supabase
    .from('target_portfolio_groups')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// PUT /api/target-portfolio-groups/:id/members — replace ALL members
router.put('/:id/members', async (req: AuthenticatedRequest, res: any) => {
  try {
    const { data: group } = await supabase
      .from('target_portfolio_groups').select('id').eq('id', req.params.id).eq('user_id', req.userId!).single();
    if (!group) { res.status(404).json({ error: 'Target group not found' }); return; }

    const body = membersSchema.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

    // Every member must be one of the user's own target portfolios
    const ids = body.data.map((m) => m.target_portfolio_id);
    if (ids.length) {
      const { data: owned } = await supabase.from('target_portfolios').select('id').eq('user_id', req.userId!).in('id', ids);
      if ((owned ?? []).length !== ids.length) { res.status(400).json({ error: 'Unknown target portfolio in members' }); return; }
    }

    const { error: delErr } = await supabase.from('target_portfolio_group_members').delete().eq('group_id', req.params.id);
    if (delErr) { res.status(500).json({ error: delErr.message }); return; }
    if (!body.data.length) { res.json([]); return; }

    const { data, error: insErr } = await supabase
      .from('target_portfolio_group_members')
      .insert(body.data.map((m, idx) => ({
        group_id:            req.params.id,
        target_portfolio_id: m.target_portfolio_id,
        weight_pct:          m.weight_pct,
        sort_order:          m.sort_order ?? idx,
        user_id:             req.userId!,
      })))
      .select();
    if (insErr) { res.status(500).json({ error: insErr.message }); return; }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/target-portfolio-groups/:id/activate — make this the one active plan
router.post('/:id/activate', async (req: AuthenticatedRequest, res: any) => {
  try {
    // One active plan overall: clear every target portfolio and target group, then activate this one
    await Promise.all([
      supabase.from('target_portfolios').update({ is_active: false }).eq('user_id', req.userId!),
      supabase.from('target_portfolio_groups').update({ is_active: false }).eq('user_id', req.userId!),
    ]);
    const { data, error } = await supabase
      .from('target_portfolio_groups')
      .update({ is_active: true })
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .select()
      .single();
    if (error || !data) { res.status(404).json({ error: 'Target group not found' }); return; }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════
//  REBALANCE ANALYSIS
// GET /api/target-portfolio-groups/:id/rebalance?portfolioId=xxx | groupId=xxx [&base=current|investable]
// ═════════════════════════════════════════════════════════════
router.get('/:id/rebalance', async (req: AuthenticatedRequest, res: any) => {
  const q = (k: string) => { const v = req.query[k]; return (Array.isArray(v) ? v[0] : v) as string | undefined; };
  try {
    const [group] = await listGroups(req.userId!, req.params.id as string);
    if (!group) { res.status(404).json({ error: 'Target group not found' }); return; }

    const ids = group.members.map((m: any) => m.target_portfolio_id);
    const [{ data: tps }, { data: items }] = await Promise.all([
      supabase.from('target_portfolios').select('id, name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('target_portfolio_items').select('*').in('target_portfolio_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    ]);
    const members: TargetMemberInput[] = group.members.map((m: any) => ({
      target_portfolio_id: m.target_portfolio_id,
      name:                (tps ?? []).find((t) => t.id === m.target_portfolio_id)?.name ?? 'Unknown',
      weight_pct:          Number(m.weight_pct),
      items:               (items ?? [])
        .filter((i) => i.target_portfolio_id === m.target_portfolio_id)
        .map((i) => ({ ...i, allocation_pct: Number(i.allocation_pct) })),
    }));

    const { status, body } = await buildRebalanceResult(
      req.userId!,
      {
        kind: 'group', id: group.id, name: group.name, is_active: group.is_active,
        investable_amount: group.investable_amount ?? null, investable_currency: group.investable_currency ?? 'AUD',
        members,
      },
      { portfolioId: q('portfolioId'), groupId: q('groupId'), base: q('base') },
    );
    res.status(status).json(body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
