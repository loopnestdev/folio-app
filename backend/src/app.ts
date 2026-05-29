import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env';
import { setupRoutes } from './routes';

export const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', generalLimiter);

// Rate limiting — stricter for file imports
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests.' },
});
app.use('/api/portfolios/:id/import', importLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DB connectivity check — measures Railway→Supabase latency
app.get('/health/db', async (_req, res) => {
  const { supabase } = await import('./lib/supabase');
  const t = Date.now();
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    res.json({ status: error ? 'error' : 'ok', db_ms: Date.now() - t, error: error?.message });
  } catch (err: any) {
    res.json({ status: 'exception', db_ms: Date.now() - t, error: err.message });
  }
});

// JWT config diagnostic — confirms SUPABASE_JWT_SECRET is loaded on Railway
app.get('/health/jwt', (_req, res) => {
  res.json({
    jwt_configured: !!env.SUPABASE_JWT_SECRET,
    jwt_secret_length: env.SUPABASE_JWT_SECRET?.length ?? 0,
  });
});

// Routes
setupRoutes(app);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});
