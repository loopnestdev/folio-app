import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import type { AuthenticatedRequest } from '../types';

const router = Router();

const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);

router.use(use(authMiddleware), use(requireApproved));

const portfolioSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  currency:    z.string().length(3).default('AUD'),
  group_id:    z.string().uuid().optional().nullable(),
});

router.get('/', async (req: AuthenticatedRequest, res: any) => {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: true });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.post('/', async (req: AuthenticatedRequest, res: any) => {
  const body = portfolioSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({ ...body.data, user_id: req.userId! })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.get('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Portfolio not found' }); return; }
  res.json(data);
});

// PUT and PATCH are both supported (frontend uses PATCH)
const handleUpdate = async (req: AuthenticatedRequest, res: any) => {
  const body = portfolioSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { data, error } = await supabase
    .from('portfolios')
    .update(body.data)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();

  if (error || !data) { res.status(404).json({ error: 'Portfolio not found' }); return; }
  res.json(data);
};

router.put('/:id', handleUpdate);
router.patch('/:id', handleUpdate);

router.delete('/:id', async (req: AuthenticatedRequest, res: any) => {
  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
