import type { Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import { verifyJwt } from '../lib/verifyJwt';
import type { AuthenticatedRequest } from '../types';

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Prefer local JWT verification (no network round-trip).
    // Falls back to Supabase network call when SUPABASE_JWT_SECRET is absent.
    let userId: string;
    const localPayload = verifyJwt(token);

    if (localPayload) {
      userId = localPayload.sub;
    } else {
      const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      const userClient = createClient(env.SUPABASE_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      userId = user.id;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      res.status(401).json({ error: 'User profile not found' });
      return;
    }

    req.user = profile;
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}
