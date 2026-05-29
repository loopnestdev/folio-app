import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';
import { supabase } from '../lib/supabase';
import type { AuthenticatedRequest } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved), use(requireAdmin));

router.get('/users', async (_req: AuthenticatedRequest, res: any) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.put('/users/:id/approve', async (req: AuthenticatedRequest, res: any) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: 'approved' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.put('/users/:id/reject', async (req: AuthenticatedRequest, res: any) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: 'rejected' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.put('/users/:id/role', async (req: AuthenticatedRequest, res: any) => {
  const schema = z.object({ role: z.enum(['admin', 'standard']) });
  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('profiles')
    .update({ role: body.data.role })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
