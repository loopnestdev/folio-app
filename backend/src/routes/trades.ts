import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { parseMoomooStatement } from '../services/pdf-parser/moomoo';
import type { AuthenticatedRequest, ParsedTrade } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

async function verifyPortfolioOwnership(portfolioId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

async function upsertSecurity(symbol: string, name: string, exchange: string, currency: string) {
  const { data } = await supabase
    .from('securities')
    .upsert(
      { symbol: symbol.toUpperCase(), name, exchange, currency },
      { onConflict: 'symbol,exchange' }
    )
    .select('id')
    .single();
  return data?.id as string | undefined;
}

const tradeSchema = z.object({
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trade_type: z.enum(['buy', 'sell', 'dividend', 'interest', 'drp', 'split']),
  symbol: z.string().min(1).max(20),
  security_name: z.string().optional(),
  exchange: z.string().optional().default('ASX'),
  quantity: z.number().min(0),
  price: z.number().min(0),
  brokerage: z.number().min(0).default(0),
  gst: z.number().min(0).default(0),
  currency: z.string().length(3).default('AUD'),
  exchange_rate: z.number().min(0).default(1),
  notes: z.string().optional().nullable(),
});

// GET /api/portfolios/:portfolioId/trades
router.get('/:portfolioId/trades', async (req: AuthenticatedRequest, res: any) => {
  const portfolioId = req.params.portfolioId as string;
  if (!(await verifyPortfolioOwnership(portfolioId, req.userId!))) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const { from, to, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('trades')
    .select('*, security:securities(*)', { count: 'exact' })
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (from) query = query.gte('trade_date', from);
  if (to) query = query.lte('trade_date', to);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ data, total: count, page: pageNum, limit: limitNum });
});

// POST /api/portfolios/:portfolioId/trades
router.post('/:portfolioId/trades', async (req: AuthenticatedRequest, res: any) => {
  const portfolioId = req.params.portfolioId as string;
  if (!(await verifyPortfolioOwnership(portfolioId, req.userId!))) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const body = tradeSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { symbol, security_name, exchange, currency, ...tradeData } = body.data;
  const securityId = await upsertSecurity(symbol, security_name ?? symbol, exchange, currency);

  const { data, error } = await supabase
    .from('trades')
    .insert({
      ...tradeData,
      portfolio_id: portfolioId,
      security_id: securityId ?? null,
      currency,
      source: 'manual',
    })
    .select('*, security:securities(*)')
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// PUT /api/trades/:id
router.put('/trade/:id', async (req: AuthenticatedRequest, res: any) => {
  const body = tradeSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  // Verify ownership via portfolio
  const { data: trade } = await supabase.from('trades').select('portfolio_id').eq('id', req.params.id).single();
  if (!trade) { res.status(404).json({ error: 'Trade not found' }); return; }
  if (!(await verifyPortfolioOwnership(trade.portfolio_id as string, req.userId!))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { symbol, security_name, exchange, currency, ...tradeData } = body.data as any;
  let securityId: string | undefined;
  if (symbol) {
    securityId = await upsertSecurity(symbol, security_name ?? symbol, exchange ?? 'ASX', currency ?? 'AUD');
  }

  const updateData: Record<string, unknown> = { ...tradeData };
  if (securityId) updateData.security_id = securityId;
  if (currency) updateData.currency = currency;

  const { data, error } = await supabase
    .from('trades')
    .update(updateData)
    .eq('id', req.params.id)
    .select('*, security:securities(*)')
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// DELETE /api/trades/:id
router.delete('/trade/:id', async (req: AuthenticatedRequest, res: any) => {
  const { data: trade } = await supabase.from('trades').select('portfolio_id').eq('id', req.params.id).single();
  if (!trade) { res.status(404).json({ error: 'Trade not found' }); return; }
  if (!(await verifyPortfolioOwnership(trade.portfolio_id as string, req.userId!))) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { error } = await supabase.from('trades').delete().eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// POST /api/portfolios/:portfolioId/import — parse PDF, return preview
router.post('/:portfolioId/import', upload.single('file'), async (req: AuthenticatedRequest, res: any) => {
  const portfolioId = req.params.portfolioId as string;
  if (!(await verifyPortfolioOwnership(portfolioId, req.userId!))) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No PDF file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.endsWith('.pdf')) {
    res.status(400).json({ error: 'Only PDF files are accepted' });
    return;
  }

  try {
    const parsed = await parseMoomooStatement(req.file.buffer);
    res.json({ trades: parsed, count: parsed.length });
  } catch (err: any) {
    res.status(422).json({ error: 'Failed to parse PDF: ' + (err.message as string) });
  }
});

// POST /api/portfolios/:portfolioId/import/confirm — save parsed trades
router.post('/:portfolioId/import/confirm', async (req: AuthenticatedRequest, res: any) => {
  const portfolioId = req.params.portfolioId as string;
  if (!(await verifyPortfolioOwnership(portfolioId, req.userId!))) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  const schema = z.object({
    trades: z.array(z.object({
      trade_date: z.string(),
      trade_type: z.enum(['buy', 'sell', 'dividend', 'interest', 'drp', 'split']),
      symbol: z.string(),
      security_name: z.string(),
      exchange: z.string(),
      currency: z.string(),
      quantity: z.number(),
      price: z.number(),
      amount: z.number(),
      brokerage: z.number(),
      gst: z.number(),
      exchange_rate: z.number().optional(),
      notes: z.string().optional(),
    })),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const inserted = [];
  for (const t of body.data.trades as ParsedTrade[]) {
    const securityId = await upsertSecurity(t.symbol, t.security_name, t.exchange, t.currency);

    const { data } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolioId,
        security_id: securityId ?? null,
        trade_date: t.trade_date,
        trade_type: t.trade_type,
        quantity: t.quantity,
        price: t.price,
        brokerage: t.brokerage,
        gst: t.gst,
        currency: t.currency,
        exchange_rate: t.exchange_rate ?? 1,
        notes: t.notes ?? null,
        source: 'pdf_import',
      })
      .select()
      .single();

    if (data) inserted.push(data);
  }

  res.status(201).json({ inserted: inserted.length, trades: inserted });
});

export default router;
