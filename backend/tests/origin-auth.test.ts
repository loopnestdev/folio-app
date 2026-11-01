import request from 'supertest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.NODE_ENV = 'test';
process.env.ORIGIN_AUTH_SECRET = 's3cret\n';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { app } from '../src/app';
import { originAuthorized } from '../src/middleware/originAuth';

describe('originAuthorized', () => {
  it('allows everything when no secret is configured', () => {
    expect(originAuthorized(undefined, undefined)).toBe(true);
    expect(originAuthorized('anything', '  \n')).toBe(true);
  });

  it('requires the exact secret when one is configured', () => {
    expect(originAuthorized('s3cret', 's3cret')).toBe(true);
    expect(originAuthorized('s3creT', 's3cret')).toBe(false);
    expect(originAuthorized('s3cret-longer', 's3cret')).toBe(false);
    expect(originAuthorized(undefined, 's3cret')).toBe(false);
    expect(originAuthorized(['s3cret', 's3cret'], 's3cret')).toBe(false);
  });

  it('ignores surrounding whitespace, e.g. a trailing newline from pbcopy', () => {
    expect(originAuthorized('s3cret', 's3cret\n')).toBe(true);
    expect(originAuthorized(' s3cret ', 's3cret')).toBe(true);
  });
});

describe('requireOriginAuth on the app', () => {
  it('rejects a request without the header with 403', async () => {
    const res = await request(app).get('/api/portfolios');
    expect(res.status).toBe(403);
  });

  it('rejects a wrong header with 403', async () => {
    const res = await request(app).get('/api/portfolios').set('X-Origin-Auth', 'guess');
    expect(res.status).toBe(403);
  });

  it('passes a request carrying the secret on to the routes', async () => {
    const res = await request(app).get('/no-such-route').set('X-Origin-Auth', 's3cret');
    expect(res.status).toBe(404);
  });

  it('exempts the health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
