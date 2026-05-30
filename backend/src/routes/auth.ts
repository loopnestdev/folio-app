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
  const t0 = Date.now();
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  console.log(`[profile] request received, token length=${token.length}`);

  // Prefer local JWT verification (no network round-trip).
  // Falls back to Supabase network call when SUPABASE_JWT_SECRET is absent.
  let userId: string;
  let email: string;
  let full_name: string | null;
  let avatar_url: string | null;

  // Try local JWT verification first (no network round-trip).
  // Falls back to Supabase getUser() if secret is absent OR if signature fails
  // (e.g. wrong secret value configured). Now that the frontend deadlock is
  // fixed, getUser() from Railway is fast (<500ms) so the fallback is fine.
  let localPayload;
  try {
    localPayload = verifyJwt(token);
  } catch (e: any) {
    console.log(`[profile] local JWT failed (${e?.message}) — falling back to getUser()`);
    localPayload = null; // fall through to network verification below
  }

  if (localPayload) {
    console.log(`[profile] local JWT ok in ${Date.now()-t0}ms`);
    userId = localPayload.sub;
    email = localPayload.email ?? '';
    full_name = (localPayload.user_metadata?.full_name as string | undefined) ?? null;
    avatar_url = (localPayload.user_metadata?.avatar_url as string | undefined) ?? null;
  } else {
    console.log(`[profile] using network getUser() at ${Date.now()-t0}ms`);
    const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    const userClient = createClient(env.SUPABASE_URL, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      console.log(`[profile] getUser() rejected at ${Date.now()-t0}ms:`, authError?.message);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    console.log(`[profile] getUser() ok at ${Date.now()-t0}ms`);
    userId = user.id;
    email = user.email ?? '';
    full_name = (user.user_metadata?.full_name as string | undefined) ?? null;
    avatar_url = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  }

  console.log(`[profile] userId=${userId}, querying DB at ${Date.now()-t0}ms`);
  // Check if profile already exists to avoid overwriting role/status on re-login.
  const { data: existing } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .maybeSingle();

  console.log(`[profile] existing=${!!existing} at ${Date.now()-t0}ms`);
  if (existing) {
    // Returning user — only refresh mutable metadata, preserve role & status.
    const { data, error } = await supabase
      .from('profiles')
      .update({ email, full_name, avatar_url })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.log(`[profile] update error at ${Date.now()-t0}ms:`, error.message);
      res.status(500).json({ error: error.message });
      return;
    }
    console.log(`[profile] returning existing profile at ${Date.now()-t0}ms`);
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
