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
 * Verify a Supabase-issued JWT locally — HS256 tokens only.
 *
 * Supabase projects that have migrated to the new JWT Signing Keys (ES256
 * asymmetric) will get null here, causing callers to fall back to
 * supabase.auth.getUser() over the network. That's fine — the frontend
 * circular deadlock has been eliminated so getUser() is now fast (<500ms).
 *
 * Returns null (no error, use network fallback) when:
 *   - SUPABASE_JWT_SECRET is not configured
 *   - Token uses a non-HS256 algorithm (ES256, RS256, etc.)
 *
 * Throws when the token is malformed, HS256 signature is wrong, expired,
 * or has an unexpected audience — these are hard auth failures.
 */
export function verifyJwt(token: string): SupabaseJWTPayload | null {
  if (!env.SUPABASE_JWT_SECRET) {
    return null; // no secret — caller uses network verification
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [header, payload, signature] = parts;

  // Check the algorithm before attempting HMAC — asymmetric tokens (ES256
  // etc.) can't be verified with the HS256 secret; return null so the caller
  // falls back to getUser() rather than throwing a misleading signature error.
  let headerJson: { alg?: string };
  try {
    headerJson = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed JWT header');
  }

  if (headerJson.alg !== 'HS256') {
    return null; // asymmetric token — caller uses network verification
  }

  // Supabase displays the JWT secret as a base64url-encoded string in the
  // dashboard, but GoTrue signs tokens using the decoded bytes as the HMAC key.
  const secretBytes = Buffer.from(env.SUPABASE_JWT_SECRET, 'base64url');
  const expected = createHmac('sha256', secretBytes)
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
