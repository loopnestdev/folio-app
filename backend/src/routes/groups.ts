import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import type { AuthenticatedRequest } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);

router.use(use(authMiddleware), use(requireApproved));

const groupSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
});

// ── GET /api/groups ──────────────────────────────────────────
// Returns all groups belonging to the user, with their portfolios nested.
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

// ── POST /api/groups ─────────────────────────────────────────
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

// ── PATCH /api/groups/:id ────────────────────────────────────
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

// ── DELETE /api/groups/:id ───────────────────────────────────
// Deletes the group. Portfolios' group_id is set to NULL by the FK ON DELETE SET NULL.
router.delete('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { error } = await supabase
    .from('portfolio_groups')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
