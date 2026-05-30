import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireApproved } from '../middleware/requireApproved';
import { getForexRate } from '../services/market-data/yahoo';
import type { AuthenticatedRequest } from '../types';

const router = Router();
const use = (fn: any) => (req: any, res: any, next: any) => fn(req, res, next);
router.use(use(authMiddleware), use(requireApproved));

/**
 * GET /api/forex?from=USD&to=AUD&date=2025-01-15
 *
 * Returns the exchange rate for converting 1 unit of `from` into `to`
 * at the closest available trading day to `date`.
 *
 * Response: { from: 'USD', to: 'AUD', date: '2025-01-15', rate: 1.58 }
 */
router.get('/', async (req: AuthenticatedRequest, res: any) => {
  const { from, to, date } = req.query as Record<string, string | undefined>;

  if (!from || !to || !date) {
    res.status(400).json({ error: 'from, to, and date query parameters are required' });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    return;
  }

  const fromUpper = from.toUpperCase();
  const toUpper   = to.toUpperCase();

  try {
    const rate = await getForexRate(fromUpper, toUpper, date);
    res.json({ from: fromUpper, to: toUpper, date, rate });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to fetch forex rate' });
  }
});

export default router;
