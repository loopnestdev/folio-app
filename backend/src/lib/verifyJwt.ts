import { createHmac } from 'crypto';
import { env } from '../config/env';

export interface SupabaseJWTPayload {
  sub: string;           // user UUID
  email?: string;
  aud: string;
  exp: number;
  iat: number;
  role: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    role?: string;
    [key: string]: unknown;
  };
}

/**
 * Verify a Supabase-issued JWT locally using HMAC-SHA256.
 *
 * Avoids the ~500ms–30s network round-trip to Supabase's /auth/v1/user
 * endpoint that previously happened on every request.
 *
 * Returns the decoded payload on success.
 * Returns null if SUPABASE_JWT_SECRET is not configured (caller should
 * fall back to network verification).
 * Throws if the token is malformed, has an invalid signature, is
 * expired, or has an unexpected audience.
 */
export function verifyJwt(token: string): SupabaseJWTPayload | null {
  if (!env.SUPABASE_JWT_SECRET) {
    // Secret not yet configured — caller should use network verification.
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [header, payload, signature] = parts;

  // Re-compute expected HMAC-SHA256 signature over "header.payload"
  const expected = createHmac('sha256', env.SUPABASE_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) {
    throw new Error('Invalid JWT signature');
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (diff !== 0) {
    throw new Error('Invalid JWT signature');
  }

  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as SupabaseJWTPayload;

  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired');
  }

  if (decoded.aud !== 'authenticated') {
    throw new Error('Invalid JWT audience');
  }

  return decoded;
}
