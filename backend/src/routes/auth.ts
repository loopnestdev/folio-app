import { Router } from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { authMiddleware } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { env } from '../config/env';
import { verifyJwt } from '../lib/verifyJwt';
import type { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * POST /api/auth/profile — Bootstrap or return the caller's folio profile.
 *
 * Uses JWT-only verification (no existing profile required) so that brand-new
 * users can create their profile on first sign-in. All other protected routes
 * use the full authMiddleware which additionally checks that a profile exists.
 *
 * User data (email, name, avatar) is read from the Supabase user record — no
 * request body is needed, which removes a previous chicken-and-egg problem
 * where the frontend had to supply user data it didn't always have.
 */
router.post('/profile', async (req: any, res: any) => {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }
  const token = authHeader.slice(7);

  // Prefer local JWT verification (no network round-trip).
  // Falls back to Supabase network call when SUPABASE_JWT_SECRET is absent.
  let userId: string;
  let email: string;
  let full_name: string | null;
  let avatar_url: string | null;

  let localPayload;
  try {
    localPayload = verifyJwt(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  if (localPayload) {
    userId = localPayload.sub;
    email = localPayload.email ?? '';
    full_name = (localPayload.user_metadata?.full_name as string | undefined) ?? null;
    avatar_url = (localPayload.user_metadata?.avatar_url as string | undefined) ?? null;
  } else {
    // SUPABASE_JWT_SECRET not configured — fall back to network verification.
    const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    const userClient = createClient(env.SUPABASE_URL, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    userId = user.id;
    email = user.email ?? '';
    full_name = (user.user_metadata?.full_name as string | undefined) ?? null;
    avatar_url = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  }

  // Check if profile already exists to avoid overwriting role/status on re-login.
  const { data: existing } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    // Returning user — only refresh mutable metadata, preserve role & status.
    const { data, error } = await supabase
      .from('profiles')
      .update({ email, full_name, avatar_url })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
    return;
  }

  // New user — determine role/status based on whether any profiles exist yet.
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      full_name,
      avatar_url,
      role: isFirst ? 'admin' : 'standard',
      status: isFirst ? 'approved' : 'pending',
    })
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
