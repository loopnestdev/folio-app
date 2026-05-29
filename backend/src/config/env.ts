import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  // Used for local (in-process) JWT verification — eliminates the
  // round-trip to Supabase's /auth/v1/user on every request.
  // Obtain from: Supabase Dashboard → Project Settings → API → JWT Secret
  // Falls back to network verification when absent (slower but functional).
  SUPABASE_JWT_SECRET: z.string().optional().default(''),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
