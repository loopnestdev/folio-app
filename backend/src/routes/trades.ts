import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { supabase } from '../lib/supabase';
import { parseMoomooStatement } from '../services/pdf-parser/moomoo';
import { parseMoomooAnnualSummary } from '../services/pdf-parser/moomoo-xlsx';
import { getForexRate } from '../services/market-data/yahoo';
import type { AuthenticatedRequest, ParsedTrade } from '../types';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.endsWith('.pdf') || file.originalname.endsWith('.xlsx');
    cb(null, ok);
  },
});

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
  trade_type: z.enum(['buy', 'sell', 'dividend', 'interest', 'other_income', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in', 'fx_transfer_in', 'fx_transfer_out']),
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
  const limitNum = Math.min(2000, Math.max(1, parseInt(limit)));
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

// PUT /api/portfolios/:portfolioId/trades/:id
router.put('/:portfolioId/trades/:id', async (req: AuthenticatedRequest, res: any) => {
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

// DELETE /api/portfolios/:portfolioId/trades/:id
router.delete('/:portfolioId/trades/:id', async (req: AuthenticatedRequest, res: any) => {
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

// Shared handler — parse a Moomoo PDF and return trade preview with forex rates
async function handleImportParse(req: AuthenticatedRequest, res: any) {
  const portfolioId = req.params.portfolioId as string;
  if (!(await verifyPortfolioOwnership(portfolioId, req.userId!))) {
    res.status(404).json({ error: 'Portfolio not found' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No PDF file uploaded' });
    return;
  }

  const isXlsx = req.file.originalname.endsWith('.xlsx');
  const isPdf  = req.file.originalname.endsWith('.pdf') ||
                 req.file.mimetype === 'application/pdf';

  if (!isXlsx && !isPdf) {
    res.status(400).json({ error: 'Only PDF and XLSX files are accepted' });
    return;
  }

  try {
    // Parse the file using the appropriate parser
    const parsed: ParsedTrade[] = isXlsx
      ? parseMoomooAnnualSummary(req.file.buffer)
      : await parseMoomooStatement(req.file.buffer);

    // Get the portfolio's base currency so we know when to convert
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('currency')
      .eq('id', portfolioId)
      .single();
    const baseCurrency = (portfolio?.currency as string | null) ?? 'AUD';

    // ── Currency filter ────────────────────────────────────────────────────
    // A single Moomoo PDF can contain both AUD (ASX) and USD (US market) trades.
    // Only import trades whose currency matches this portfolio's base currency.
    // The user imports the same file a second time against their other portfolio
    // to capture the remaining trades. Filtered-out trades are surfaced as a
    // warning so the user knows to do that second import.
    const forThisPortfolio = parsed.filter((t) => t.currency === baseCurrency);
    const filteredOut      = parsed.filter((t) => t.currency !== baseCurrency);

    // Build per-currency summary of filtered-out trades for the warning message
    const warnings: string[] = [];
    if (filteredOut.length > 0) {
      const byCurrency: Record<string, number> = {};
      for (const t of filteredOut) {
        byCurrency[t.currency] = (byCurrency[t.currency] ?? 0) + 1;
      }
      const summary = Object.entries(byCurrency)
        .map(([cur, n]) => `${n} ${cur} trade${n !== 1 ? 's' : ''}`)
        .join(', ');
      warnings.push(
        `${summary} excluded — this portfolio is ${baseCurrency}. ` +
        `Import this same file into your ${Object.keys(byCurrency).join('/')} portfolio to capture them.`,
      );
    }

    // Auto-enrich each matching trade with an exchange_rate (always 1 here
    // since trade.currency === baseCurrency, but kept for consistency)
    const enriched = await Promise.all(
      forThisPortfolio.map(async (t) => {
        if (t.currency === baseCurrency) return { ...t, exchange_rate: 1 };
        const rate = await getForexRate(t.currency, baseCurrency, t.trade_date);
        return { ...t, exchange_rate: rate };
      }),
    );

    // ── Dedup at parse time ───────────────────────────────────────────────
    // Fetch existing trades for this portfolio and build a key set so the
    // preview only shows genuinely new trades.
    //
    // For deposit/withdrawal we also fetch notes so that multiple same-day
    // same-amount deposits (e.g. three $1,000 Zepto transfers on the same
    // date) are treated as distinct trades rather than collapsed into one.
    const { data: existingTrades } = await supabase
      .from('trades')
      .select('trade_date, trade_type, quantity, price, notes, security:securities(symbol)')
      .eq('portfolio_id', portfolioId);

    // Strict key: date|symbol|type|qty|price — for normal trades.
    // deposit/withdrawal with a non-null notes value append "|notes" so that
    // same-date same-amount entries with different payment references
    // (e.g. ZEPTO_PR.xxx) are treated as distinct.
    const makeKey = (sym: string, type: string, date: string, qty: number, price: number, notes?: string | null) => {
      const base = `${date}|${sym.toUpperCase()}|${type}|${qty}|${price}`;
      if ((type === 'deposit' || type === 'withdrawal' || type === 'fx_transfer_in' || type === 'fx_transfer_out') && notes) return `${base}|${notes}`;
      return base;
    };

    const existingKeys = new Set(
      (existingTrades ?? []).map((t: any) => {
        const sym = (t.security as any)?.symbol ?? '';
        return makeKey(sym, t.trade_type, t.trade_date, Number(t.quantity), Number(t.price), t.notes);
      }),
    );
    // Loose key: date|symbol|type|qty — for zero-price parsed trades (e.g. SI IN
    // transfers) where the user may have corrected the price after first import.
    const existingLooseKeys = new Set(
      (existingTrades ?? []).map((t: any) => {
        const sym = (t.security as any)?.symbol ?? '';
        return `${t.trade_date}|${sym.toUpperCase()}|${t.trade_type}|${Number(t.quantity)}`;
      }),
    );

    const newTrades = enriched.filter((t) => {
      const strict = makeKey(t.symbol, t.trade_type, t.trade_date, t.quantity, t.price, t.notes);
      if (existingKeys.has(strict)) return false;
      // Zero-price trades: fall back to loose match so edited prices don't re-surface them
      if (t.price === 0) {
        const loose = `${t.trade_date}|${t.symbol.toUpperCase()}|${t.trade_type}|${t.quantity}`;
        if (existingLooseKeys.has(loose)) return false;
      }
      return true;
    });
    const duplicateCount = enriched.length - newTrades.length;

    if (duplicateCount > 0) {
      warnings.push(
        `${duplicateCount} trade${duplicateCount !== 1 ? 's' : ''} already imported — skipped from preview.`,
      );
    }

    // Return shape matching the ImportPreview frontend type
    res.json({
      filename:     req.file.originalname,
      parsed_count: newTrades.length,
      trades:       newTrades,
      errors:       warnings,
    });
  } catch (err: any) {
    res.status(422).json({ error: 'Failed to parse file: ' + (err.message as string) });
  }
}

// POST /api/portfolios/:portfolioId/import/parse  ← what the frontend calls
// POST /api/portfolios/:portfolioId/import        ← legacy alias
router.post('/:portfolioId/import/parse', upload.single('file'), handleImportParse);
router.post('/:portfolioId/import',       upload.single('file'), handleImportParse);

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
      trade_type: z.enum(['buy', 'sell', 'dividend', 'interest', 'other_income', 'drp', 'split', 'deposit', 'withdrawal', 'transfer_in', 'fx_transfer_in', 'fx_transfer_out']),
      symbol: z.string(),
      security_name: z.string(),
      exchange: z.string(),
      currency: z.string(),
      quantity: z.number(),
      price: z.number(),
      amount: z.number(),
      brokerage: z.number(),
      gst: z.number(),
      exchange_rate: z.number().default(1),
      notes: z.string().optional(),
    })),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const inserted = [];
  const skipped  = [];

  for (const t of body.data.trades as ParsedTrade[]) {
    const securityId = await upsertSecurity(t.symbol, t.security_name, t.exchange, t.currency);

    // Deduplicate: skip if an identical trade already exists for this portfolio.
    // Key: trade_date + security_id + trade_type + quantity + price.
    // For deposit/withdrawal with a non-null notes value (e.g. a Zepto payment
    // reference), also match on notes so that multiple same-day same-amount
    // deposits with different references are not incorrectly collapsed.
    // This prevents double-importing trades from both a monthly PDF and an
    // overlapping annual XLSX summary.
    let dupQuery = supabase
      .from('trades')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('trade_date',   t.trade_date)
      .eq('trade_type',   t.trade_type)
      .eq('quantity',     t.quantity)
      .eq('price',        t.price)
      .eq('security_id',  securityId ?? '');
    if ((t.trade_type === 'deposit' || t.trade_type === 'withdrawal' || t.trade_type === 'fx_transfer_in' || t.trade_type === 'fx_transfer_out') && t.notes) {
      dupQuery = dupQuery.eq('notes', t.notes);
    }
    const { data: existing } = await dupQuery.maybeSingle();

    if (existing) {
      skipped.push({ trade_date: t.trade_date, symbol: t.symbol });
      continue;
    }

    const { data } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolioId,
        security_id:  securityId ?? null,
        trade_date:   t.trade_date,
        trade_type:   t.trade_type,
        quantity:     t.quantity,
        price:        t.price,
        brokerage:    t.brokerage,
        gst:          t.gst,
        currency:     t.currency,
        exchange_rate: t.exchange_rate ?? 1,
        notes:        t.notes ?? null,
        source:       'pdf_import',
      })
      .select()
      .single();

    if (data) inserted.push(data);
  }

  res.status(201).json({ inserted: inserted.length, skipped: skipped.length, trades: inserted });
});

export default router;
