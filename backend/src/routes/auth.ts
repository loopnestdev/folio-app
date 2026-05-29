import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import type { AuthenticatedRequest } from '../types';

const router = Router();

router.post('/profile', authMiddleware as any, async (req: AuthenticatedRequest, res: any) => {
  const userId = req.userId!;

  const schema = z.object({
    full_name: z.string().optional(),
    email: z.string().email(),
    avatar_url: z.string().url().optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  // Check how many profiles exist to determine first user
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: body.data.email,
        full_name: body.data.full_name ?? null,
        avatar_url: body.data.avatar_url ?? null,
        role: isFirst ? 'admin' : 'standard',
        status: isFirst ? 'approved' : 'pending',
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Embed role in JWT app_metadata so folio.is_admin() can read it
  // without querying folio.profiles (which would cause RLS recursion).
  if (isFirst) {
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { role: 'admin' },
    });
  }

  res.json(data);
});

router.get('/profile', authMiddleware as any, (req: AuthenticatedRequest, res: any) => {
  res.json(req.user);
});

router.patch('/profile', authMiddleware as any, async (req: AuthenticatedRequest, res: any) => {
  const userId = req.userId!;

  const schema = z.object({
    chart_library: z.enum(['recharts', 'echarts']).optional(),
    financial_year_start: z.enum(['january', 'july']).optional(),
    full_name: z.string().min(1).optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(body.data)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
