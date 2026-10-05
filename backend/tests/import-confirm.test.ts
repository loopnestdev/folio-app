import request from 'supertest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';

// Stateful in-memory stand-in for the few queries the confirm route makes.
const db = { trades: [] as any[] };
function builder(table: string) {
  let op = 'select';
  let row: any;
  const b: any = {
    select: () => b,
    eq: () => b,
    insert: (r: any) => { op = 'insert'; row = r; return b; },
    upsert: () => { op = 'upsert'; return b; },
    single: async () => {
      if (table === 'trades' && op === 'insert') { db.trades.push(row); return { data: row, error: null }; }
      if (table === 'securities') return { data: { id: 'sec-1' }, error: null };
      return { data: { id: 'x' }, error: null };
    },
    maybeSingle: async () => ({ data: table === 'securities' ? { id: 'sec-1' } : null, error: null }),
  };
  return b;
}
jest.mock('../src/lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
jest.mock('../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { status: 'approved' }; req.userId = 'u1'; next(); },
}));

import { app } from '../src/app';

const sell = (extra: Partial<Record<string, unknown>> = {}) => ({
  trade_date: '2026-09-11', trade_type: 'sell', symbol: 'TE', security_name: 'TE', exchange: 'US', currency: 'USD',
  quantity: 100, price: 4.71, amount: 471, brokerage: 0, gst: 0, exchange_rate: 1, ...extra,
});

describe('POST /api/portfolios/:id/import/confirm', () => {
  beforeEach(() => { db.trades.length = 0; });

  it('saves every copy of identical fills instead of collapsing them into one', async () => {
    const res = await request(app)
      .post('/api/portfolios/p1/import/confirm')
      .send({ trades: [sell(), sell(), sell(), sell({ quantity: 510, amount: 2402.1 })] });
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(4);
    expect(db.trades.filter((t) => t.quantity === 100)).toHaveLength(3);
  });

  it('inserts a single missing copy even though an identical row already exists', async () => {
    // Regression: the preview sends only the missing copy; confirm must insert it, not skip it.
    db.trades.push({ trade_date: '2026-09-11', quantity: 27 }); // pre-existing identical row
    const res = await request(app)
      .post('/api/portfolios/p1/import/confirm')
      .send({ trades: [sell({ trade_date: '2026-07-01', trade_type: 'buy', symbol: 'DRAM', quantity: 27, price: 69.65 })] });
    expect(res.body.inserted).toBe(1);
  });

  it('refuses the same batch submitted twice in a row (double click)', async () => {
    const payload = { trades: [sell({ trade_date: '2026-08-08', symbol: 'DBL', quantity: 7 })] };
    const first = await request(app).post('/api/portfolios/p1/import/confirm').send(payload);
    const second = await request(app).post('/api/portfolios/p1/import/confirm').send(payload);
    expect(first.body.inserted).toBe(1);
    expect(second.body.inserted).toBe(0);
    expect(second.body.duplicate_submit).toBe(true);
    expect(db.trades.filter((t) => t.quantity === 7)).toHaveLength(1);
  });
});
