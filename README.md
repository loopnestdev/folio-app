# Folio App

A portfolio tracking web application for self-directed investors. Track trades, dividends, capital gains, and benchmarks — with full Australian CGT support and Moomoo PDF import.

**Production URL:** https://folio.ailab.build

## Features

- **Multi-portfolio** — create separate portfolios (e.g. personal, retirement)
- **Trade management** — manual entry or Moomoo PDF statement import
- **Holdings** — FIFO cost basis, unrealised gain/loss per position
- **Performance charts** — portfolio value vs. ASX 200, S&P 500, NASDAQ over any date range
- **Statistics** — Sharpe, Sortino, Beta, Max Drawdown, Correlation, Winning Months %
- **CGT report** — Australian rules (50% discount for assets held > 12 months), FIFO matching
- **Tax report** — dividends, interest, and brokerage fees by financial year (Jul–Jun or Jan–Dec)
- **Diversity report** — sector, asset type, country, and market breakdown
- **Chart library toggle** — switch between Recharts and Apache ECharts live from settings
- **Role-based access** — admin approves new users; first registered user is automatically admin
- **Google OAuth** — via Supabase Auth (shared coredb project with other loopnestdev apps)

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite 8, React 18, TypeScript, Tailwind CSS |
| State / Queries | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts v2 + Apache ECharts v5 |
| Backend | Node.js 22 LTS, Express 5, TypeScript |
| Database | Supabase coredb — `folio` schema (PostgreSQL + RLS) |
| Auth | Supabase Auth + Google OAuth |
| PDF Parsing | pdf-parse |
| Market Data | yahoo-finance2 |
| Frontend Hosting | Cloudflare Workers Sites (`wrangler deploy`) |
| Backend Hosting | Railway |

## Getting Started

### Prerequisites

- Node.js 22+
- Access to the shared **coredb** Supabase project (`lcqsatefkutiakhgexue`)
- Railway account (backend)
- Cloudflare account with Wrangler CLI (frontend)

### Environment Variables

**Backend** (`backend/.env`):
```
PORT=3001
NODE_ENV=development
SUPABASE_URL=https://lcqsatefkutiakhgexue.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```
VITE_SUPABASE_URL=https://lcqsatefkutiakhgexue.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001
```

### Database Setup

folio-app uses the shared **coredb** Supabase project with all tables in the `folio` schema (isolated from other apps that share the same Supabase instance).

**Step 1 — Expose `folio` schema in PostgREST:**
Supabase Dashboard → Project Settings → API → Exposed schemas → add `folio` → Save.

**Step 2 — Run schema bootstrap** (Supabase SQL Editor):
```sql
-- supabase-central/migrations/001_schemas.sql
-- Creates folio, signal, moat schemas with grants (safe to re-run)
```

**Step 3 — Run folio tables and RLS** (Supabase SQL Editor):
```sql
-- supabase-central/migrations/002_folio.sql
-- Creates all folio.* tables, folio.is_admin() function, RLS policies
-- Safe to re-run (all triggers and policies use DROP IF EXISTS first)
```

**Step 4 — Add OAuth redirect URL:**
Supabase Dashboard → Authentication → URL Configuration → Redirect URLs → add:
```
https://folio.ailab.build/auth/callback
```

**Step 5 — Admin bootstrap** (after first sign-in):
The backend automatically grants `role=admin, status=approved` to the first user and sets `app_metadata.role=admin` in their JWT. Sign out and sign back in so the updated JWT is issued.

Verify via SQL:
```sql
SELECT id, email, role, status FROM folio.profiles;
SELECT id, email, raw_app_meta_data FROM auth.users WHERE email = 'your-email@example.com';
```

### Local Development

```bash
# Backend
cd backend
npm install
npm run dev   # http://localhost:3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173
```

### Tests

```bash
# Backend (Jest + ts-jest)
cd backend
npm test

# Frontend (Vitest)
cd frontend
npm test
```

## PDF Import

Supported format: **Moomoo Securities Australia** monthly account statements.

The parser extracts:

- Trades from the "Trades - Securities" section (Buy to Open / Sell to Close)
- Dividends from "Asset Adjustment" entries in "Changes in Cash"
- Interest from "Coupon" entries in "Changes in Cash"

Upload via **Portfolio → Import** in the app. Review the parsed trades before confirming.

## Deployment

### Backend (Railway)

1. Connect Railway project to the GitHub repo, set **Root Directory** to `backend`
2. Railway picks up `backend/railway.json` automatically:
   - Build: `npm install --include=dev && npm run build` (ensures `tsc` is available)
   - Start: `npm start` (`node dist/index.js`)
   - Healthcheck: `GET /health`
3. Set environment variables in Railway (Settings → Variables):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
   - `FRONTEND_URL=https://folio.ailab.build`
   - `NODE_ENV=production`

### Frontend (Cloudflare Workers Sites)

```bash
cd frontend

# Set the Railway backend URL before building (baked in at build time)
VITE_API_URL=https://your-backend.up.railway.app npm run build

# Deploy
npx wrangler deploy
```

Set the following in Cloudflare Dashboard → Workers → folio-app → Settings → Variables (for future builds):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Add custom domain `folio.ailab.build` via Workers → folio-app → Triggers → Custom Domains.

## Architecture

```text
Browser → Cloudflare Workers Sites (React SPA — folio.ailab.build)
                ↓ API calls (Bearer JWT)
         Railway (Express API — backend)
                ↓ service-role key
         Supabase coredb (folio schema — PostgreSQL + Auth)
                ↓
         yahoo-finance2 (benchmark market data)
```

**Auth flow:**
1. Browser signs in via Google OAuth → Supabase issues JWT
2. Frontend attaches JWT as `Authorization: Bearer <token>` to all API calls
3. Backend `authMiddleware` verifies token via `supabase.auth.getUser()`, loads profile from `folio.profiles`
4. `requireApproved` middleware blocks `pending`/`rejected` users with HTTP 403
5. `requireAdmin` middleware gates admin-only endpoints

**RLS:** All tables have Row Level Security enabled. The backend uses the service-role key (bypasses RLS) for report calculations and profile writes. The `folio.is_admin()` function reads `app_metadata.role` from the JWT — it must NOT query `folio.profiles` directly (would cause PostgreSQL error 42P17 infinite recursion).
