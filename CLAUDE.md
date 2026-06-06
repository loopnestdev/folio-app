# CLAUDE.md — Folio App

This file is for AI coding assistants. It documents the project architecture, conventions, and critical implementation details so you can contribute effectively without reading every file first.

---

## Project Overview

**Folio App** is a full-stack portfolio tracking web application for self-directed investors. It supports trade management (manual + Moomoo PDF import), performance analytics, CGT reporting (Australian rules), multi-portfolio management, and target portfolio rebalancing with SMSF CGT estimation.

**Production URL:** https://folio.ailab.build

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + Vite 8 + TypeScript + Tailwind CSS |
| State / Queries | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts v2 + Apache ECharts v5 (user-selectable) |
| Backend | Node.js 22 LTS + Express 5 + TypeScript |
| Database | Supabase **coredb** — `folio` PostgreSQL schema + RLS |
| Auth | Supabase Auth + Google OAuth |
| PDF Parsing | pdf-parse |
| Market Data | yahoo-finance2 |
| Frontend Hosting | Cloudflare Workers + Assets (`wrangler deploy`) |
| Backend Hosting | Railway (Nixpacks, `backend/railway.json`) |

---

## Repository Structure

```text
folio-app/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Router, auth gate, layout shell
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx         # Supabase session + profile state
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── PendingPage.tsx         # Shown to pending-approval users
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── PortfoliosPage.tsx
│   │   │   ├── PortfolioDetailPage.tsx
│   │   │   ├── TradesPage.tsx
│   │   │   ├── ImportPage.tsx          # Moomoo PDF import flow
│   │   │   ├── HoldingsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── AdminPage.tsx
│   │   │   ├── reports/               # Performance, Statistics, CGT, Tax, etc.
│   │   │   └── targets/               # Target portfolio list, detail, rebalance
│   │   ├── components/
│   │   │   ├── charts/                # Recharts + ECharts dual implementations
│   │   │   ├── forms/                 # Trade form, portfolio form
│   │   │   ├── guards/                # Route guards (auth, approved, admin)
│   │   │   ├── layout/                # Sidebar, nav, layout wrapper
│   │   │   └── ui/                    # Shared UI primitives
│   │   ├── hooks/
│   │   │   ├── usePortfolio.ts
│   │   │   ├── usePerformance.ts
│   │   │   ├── useReports.ts
│   │   │   ├── useStatistics.ts
│   │   │   └── useTargetPortfolios.ts # Target portfolio CRUD + rebalance hook
│   │   ├── lib/
│   │   │   ├── api.ts                 # Axios instance with JWT interceptor
│   │   │   └── supabase.ts            # Supabase client (folio schema)
│   │   └── types/                     # Shared TypeScript types
│   ├── wrangler.toml                  # Cloudflare Workers + Assets config
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── app.ts                     # Express app setup, CORS, Helmet, rate limiting
│   │   ├── index.ts                   # Entry point, listen
│   │   ├── config/env.ts              # Zod-validated env schema
│   │   ├── lib/supabase.ts            # Service-role Supabase client (folio schema)
│   │   ├── middleware/
│   │   │   ├── auth.ts                # JWT verification + profile load
│   │   │   ├── requireApproved.ts     # Blocks pending/rejected users (403)
│   │   │   └── requireAdmin.ts        # Blocks non-admin users (403)
│   │   ├── routes/
│   │   │   ├── auth.ts                # POST /api/auth/profile (lazy profile creation)
│   │   │   ├── portfolios.ts          # CRUD + holdings + performance
│   │   │   ├── trades.ts              # CRUD + PDF import
│   │   │   ├── reports.ts             # CGT, tax, diversity, statistics, etc.
│   │   │   ├── targetPortfolios.ts    # Target portfolio CRUD + rebalance analysis
│   │   │   └── admin.ts               # User management (admin only)
│   │   ├── services/
│   │   │   ├── calculations/
│   │   │   │   ├── holdings.ts        # FIFO cost basis, unrealised P&L
│   │   │   │   └── statistics.ts      # Sharpe, Sortino, Beta, etc.
│   │   │   ├── market-data/
│   │   │   │   └── yahoo.ts           # yahoo-finance2 price history + benchmarks
│   │   │   └── pdf-parser/
│   │   │       └── moomoo.ts          # Moomoo AU statement parser
│   │   └── types/                     # Shared backend types + AuthenticatedRequest
│   ├── railway.json                   # Build/start/healthcheck config for Railway
│   ├── .nvmrc                         # Node.js 22 (Nixpacks version pin)
│   └── package.json                   # engines.node>=22
│
├── supabase-central/
│   └── migrations/
│       ├── 001_schemas.sql            # Creates folio/signal/moat schemas (idempotent)
│       └── 002_folio.sql              # All folio.* tables, RLS, is_admin() (idempotent)
│
├── supabase/                          # LEGACY — standalone project migrations (do NOT use)
│   └── migrations/001_initial.sql     # Old public-schema migration, not for coredb
│
├── README.md
├── CHANGELOG.md
├── CLAUDE.md                          # This file
├── DESIGN.md
└── PROMPT.md
```

---

## Local Development

```bash
# Backend
cd backend && npm install && npm run dev   # http://localhost:3001

# Frontend (separate terminal)
cd frontend && npm install && npm run dev  # http://localhost:5173
```

The frontend calls the backend at `VITE_API_URL` (defaults to `http://localhost:3001`).

---

## Environment Variables

**`backend/.env`**

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | `https://lcqsatefkutiakhgexue.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key — bypasses RLS for report calculations |
| `SUPABASE_ANON_KEY` | No | Used by `authMiddleware` to verify user JWTs |
| `FRONTEND_URL` | No | CORS origin (`https://folio.ailab.build` in prod) |
| `PORT` | No | Defaults to `3001` |
| `NODE_ENV` | No | `development` \| `production` |

**`frontend/.env`**

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Same coredb URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon key — used by Supabase JS client for auth only |
| `VITE_API_URL` | Yes | Backend URL (`http://localhost:3001` locally, Railway URL in prod) |

---

## Database: coredb + folio schema

folio-app shares the **coredb** Supabase project (`lcqsatefkutiakhgexue`) with signal-dashboard and moat-finder. Each app is isolated in its own PostgreSQL schema:

- `signal` → signal-dashboard
- `moat` → moat-finder
- `folio` → folio-app

The Supabase JS client in `frontend/src/lib/supabase.ts` is created with `{ db: { schema: 'folio' } }` so PostgREST sends `Accept-Profile: folio` on every request. The backend's service-role client in `backend/src/lib/supabase.ts` uses the same schema option.

**coredb setup (one-time, Supabase Dashboard → SQL Editor):**
1. Run `supabase-central/migrations/001_schemas.sql` — creates `folio` schema with grants
2. Run `supabase-central/migrations/002_folio.sql` — creates all folio tables and RLS
3. Dashboard → Project Settings → API → Exposed schemas → add `folio`
4. Dashboard → Authentication → URL Configuration → Redirect URLs → add `https://folio.ailab.build/auth/callback`

Both migration files are **idempotent** — safe to re-run (all triggers/policies use `DROP IF EXISTS` before creation).

### RLS pattern

**CRITICAL — `folio.is_admin()` must NOT query `folio.profiles`**

The admin helper function reads the `role` field from the JWT `app_metadata` claim:

```sql
CREATE OR REPLACE FUNCTION folio.is_admin()
RETURNS BOOLEAN AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Querying `folio.profiles` inside this function would cause **PostgreSQL error 42P17** (infinite recursion: SELECT policy on profiles calls `is_admin()` which re-queries profiles).

The `app_metadata.role` claim is set in `auth.users.raw_app_meta_data` by the backend when creating the first admin:

```typescript
// backend/src/routes/auth.ts — on first profile creation (isFirst === true)
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'admin' },
});
```

After this, the user must **sign out and sign back in** to receive a JWT with the updated claim.

### Profile model (`folio.profiles`)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | FK → auth.users |
| `email` | TEXT | |
| `full_name` | TEXT | nullable |
| `avatar_url` | TEXT | nullable |
| `role` | TEXT | `'admin'` or `'standard'` |
| `status` | TEXT | `'pending'`, `'approved'`, `'rejected'` |
| `chart_library` | TEXT | `'recharts'` (default) or `'echarts'` |
| `financial_year_start` | TEXT | `'july'` (default) or `'january'` |

---

## Auth Flow

1. User clicks "Sign in with Google" → `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin + '/auth/callback' })`
2. Google redirects to Supabase, which exchanges the OAuth code and redirects to `/auth/callback?code=...` (PKCE)
3. `AuthCallbackPage` subscribes to `onAuthStateChange`; Supabase auto-handles the PKCE exchange (`detectSessionInUrl: true`)
4. On `SIGNED_IN`, `window.location.href = '/'` — hard redirect so `AuthContext` re-initialises with the persisted session
5. `AuthContext.onAuthStateChange` fires `INITIAL_SESSION` → **synchronously** calls `setAuthToken(s.access_token)` then `fetchProfile()`
6. `POST /api/auth/profile` uses JWT from `_authToken` (no `getSession()` call — avoids deadlock)
7. Backend verifies JWT (local HS256 if secret set, else `getUser()` fallback) → loads/creates profile
8. On first profile (`isFirst`), backend sets `role=admin, status=approved`, patches `app_metadata`
9. Profile returned → `ApprovedGuard` passes → dashboard renders

**CRITICAL — do NOT call `supabase.auth.getSession()` inside an `onAuthStateChange` callback (directly or via Axios interceptors)**. In Supabase JS v2, `_notifyAllSubscribers` awaits each subscriber callback; calling `getSession()` inside the callback awaits `initializePromise` which awaits the same callback → infinite deadlock. Use the synchronous `_authToken` store instead.

**Middleware chain for protected routes:**
```
authMiddleware → requireApproved → [requireAdmin] → route handler
```

### JWT Verification (backend)

`backend/src/lib/verifyJwt.ts` implements in-process HS256 verification:
- Returns `null` if `SUPABASE_JWT_SECRET` is unset or token is ES256 (migrated projects) → caller uses `getUser()` network fallback
- Supabase shows the JWT secret base64url-encoded; the code decodes it before passing to `createHmac`
- `coredb` has migrated to ES256 signing keys; tokens are always verified via `getUser()` for this project

**Environment variable:** `SUPABASE_JWT_SECRET` (Railway) — from Supabase Dashboard → Settings → JWT Keys → Legacy JWT Secret.

---

## Build & Type Check

Always run after making changes. All must pass with zero errors:

```bash
cd backend  && npx tsc --noEmit   # typecheck
cd backend  && npm run build      # tsc → dist/

cd frontend && npx tsc --noEmit   # typecheck
cd frontend && npm run build      # tsc + vite → dist/
```

Note: `backend/package.json` has a `typecheck` script (`tsc --noEmit`). Run `npm run typecheck` in `backend/`.

---

## Tests

Run after every change:

```bash
cd backend  && npm test   # 26 tests — Jest + ts-jest
cd frontend && npm test   # 59 tests — Vitest
```

All tests must pass before committing. Generate new tests when new logic is introduced.

**Backend test coverage highlights:**

- `src/services/calculations/holdings.ts` — FIFO cost basis, CGT discount logic
- `src/services/calculations/statistics.ts` — Sharpe, Sortino, Beta, etc.
- `src/services/pdf-parser/moomoo.ts` — Moomoo statement parsing

**Frontend test coverage highlights:**

- Auth flow, pending state, route guards
- Chart component rendering (both Recharts and ECharts)
- Form validation

---

## Design System

The frontend uses a **Stripe-inspired design system** with full dark/light mode support.

### Design tokens

All colors live in `frontend/src/index.css` as CSS custom properties. **Never use hardcoded hex values in components** — always reference the tokens.

```css
/* Light mode (:root) → Dark mode ([data-theme="dark"]) */
--c-ink          /* primary text */
--c-ink-sec      /* secondary text */
--c-ink-mute     /* muted labels */
--c-canvas       /* page/card background */
--c-canvas-soft  /* page shell background */
--c-canvas-cream /* accent tint */
--c-border       /* hairline borders */
--c-primary      /* indigo #533afd / dark #7c6dff */
--c-primary-deep /* darker indigo */
--c-primary-bg   /* indigo tint background */
--c-bull         /* green for gains */
--c-bear         /* ruby for losses */
--c-warn         /* amber for caution */
--c-s1, --c-s2   /* box shadows */
```

For **inline styles and chart configs**, use the typed constants in `frontend/src/lib/colors.ts`:

```typescript
import { C, gainColor } from '../lib/colors';
// C.ink, C.primary, C.bull, C.bear, C.canvasSoft, ...
// gainColor(pct) → C.bull | C.bear | C.inkMute
```

For **Tailwind class strings**, use the arbitrary CSS var syntax:

```tsx
<div className="bg-[var(--c-canvas)] text-[var(--c-ink)] border-[var(--c-border)]" />
```

### Theme toggle (dark / light mode)

- `useTheme()` hook — `frontend/src/hooks/useTheme.ts` — returns `{ dark: boolean, toggle: () => void }`
- Theme is set via `data-theme="dark"` on `<html>`; preference persists in `localStorage` key `folio-theme`
- An inline `<script>` in `index.html` applies the saved theme before first paint (no flicker)
- The toggle button (Sun/Moon icon) is in the right side of `Topnav.tsx`

### Typography

- Body font: `Plus Jakarta Sans` (weight 300 default, 600 headings), loaded via Google Fonts
- Mono font: `JetBrains Mono` for numeric/code cells
- Numeric cells: add `font-feature-settings: "tnum"` (`.tnum` CSS class) for tabular figures

---

## Key Conventions

### API pattern

All data requests go through the Express backend (not direct Supabase queries from the frontend). The frontend Supabase client is used **only for auth** (session management, OAuth). Database reads/writes go through `VITE_API_URL`.

### Chart library toggle

`chart_library` is stored on the user's profile in `folio.profiles`. The settings page patches it via `PATCH /api/auth/profile`. All chart pages check this value and render either Recharts or ECharts components — the switch is live (no page reload needed).

### Financial year

`financial_year_start` is stored on the user's profile. `'july'` = Jul–Jun (Australian default), `'january'` = Jan–Dec. The tax report and CGT calculations use this setting.

### FIFO cost basis

All holdings and CGT calculations use FIFO (first-in, first-out) matching. The 50% CGT discount applies to assets held for more than 12 months before disposal.

### PDF import

The Moomoo parser (`backend/src/services/pdf-parser/moomoo.ts`) processes Moomoo Securities Australia monthly statements. The import flow:

1. `POST /api/portfolios/:id/import` — upload PDF → returns preview of parsed trades
2. `POST /api/portfolios/:id/import/confirm` — user confirms → trades are saved

---

## Deployment

### Railway (backend)

- Root directory: `backend/`
- `backend/railway.json` handles build/start/healthcheck
- Build command: `npm install --include=dev && npm run build` (devDeps needed for `tsc`)
- Start: `node dist/index.js`
- Healthcheck: `GET /health` (returns `{ status: 'ok' }`)
- Node version: pinned to 22 via `backend/.nvmrc` (Nixpacks reads this)

### Cloudflare Workers + Assets (frontend)

- `frontend/wrangler.toml` uses Wrangler v3+ `[assets]` format (NOT the deprecated `[site]` format):

  ```toml
  [assets]
  directory = "./dist"
  not_found_handling = "single-page-application"
  ```

  **Do NOT add `public/_redirects`** — `/* /index.html 200` is Cloudflare Pages syntax; in Workers Assets it causes error 100324 (infinite redirect loop). SPA routing is handled entirely by `not_found_handling`.
- Deploy: `npm run build && npx wrangler deploy` (run from `frontend/`)
- `VITE_*` vars are baked into the bundle at build time from `frontend/.env`
- Custom domain: `folio.ailab.build`
- **Do NOT use `[site]` format** — Wrangler v3+ serves a default "Hello World" worker with that config
