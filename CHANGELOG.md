# Changelog

All notable changes to Folio App are documented here.

## [0.2.1] — 2026-05-29

### Fixed

- **Cloudflare deployment serving "Hello World"** — `frontend/wrangler.toml` used the deprecated `[site]` format, which causes Wrangler v3+ to deploy a default stub worker instead of the static assets. Migrated to the Wrangler v3+ `[assets]` format. SPA deep-link routing is handled by the existing `public/_redirects` file (`/* /index.html 200`). Note: `not_found_handling = "single-page-application"` must NOT be set alongside `_redirects` — it creates a Cloudflare redirect loop (error 100324).

---

## [0.2.0] — 2026-05-29

### Added

**Infrastructure**

- `supabase-central/migrations/001_schemas.sql` — shared schema bootstrap for coredb; creates `folio`, `signal`, `moat` schemas with grants (idempotent, `CREATE SCHEMA IF NOT EXISTS`)
- `supabase-central/migrations/002_folio.sql` — full `folio` schema DDL: tables, triggers, `folio.is_admin()` JWT-based function, RLS policies, explicit grants (replaces standalone `supabase/migrations/001_initial.sql`)
- `backend/railway.json` — Railway build/start/healthcheck config; build command `npm install --include=dev && npm run build` ensures `tsc` is available despite `NODE_ENV=production`
- `backend/.nvmrc` — pins Node.js to 22 LTS; Nixpacks reads this to stop defaulting to Node 18

**Security**

- `folio.is_admin()` reads JWT `app_metadata.role` claim instead of querying `folio.profiles` directly — prevents PostgreSQL error 42P17 (RLS infinite recursion)
- Backend `POST /api/auth/profile` now calls `supabase.auth.admin.updateUserById` when creating the first admin user, embedding `{ role: 'admin' }` in `raw_app_meta_data` so `folio.is_admin()` works from the next sign-in

### Fixed

- **Railway WebSocket crash** — `@supabase/supabase-js` requires Node.js 20+ for native WebSocket; Railway defaulted to Node 18, causing `Error: Node.js 18 detected without native WebSocket support` at startup. Fixed by `.nvmrc` → `22`
- **Railway build failure** — `tsc: not found` during Railway build because TypeScript is a `devDependency` and Railway sets `NODE_ENV=production`, skipping devDeps. Fixed by explicit `buildCommand` in `railway.json`
- **RLS infinite recursion** — `folio_profiles_admin_select` and `folio_profiles_admin_update` policies originally contained a direct `folio.profiles` subquery, triggering 42P17 when the authenticated Supabase client hit the table. Replaced with `folio.is_admin()` JWT lookup
- **Idempotent migrations** — `002_folio.sql` now uses `DROP TRIGGER IF EXISTS` and `DROP POLICY IF EXISTS` before each creation, making it safe to re-run without errors

### Changed

- Migrated from standalone Supabase project to **coredb** (`lcqsatefkutiakhgexue`) — the shared Supabase project used by all loopnestdev apps. Data stored in `folio` schema; auth is shared across apps (one Google sign-in works everywhere)
- `backend/package.json` — added `engines.node: ">=22"` as belt-and-suspenders alongside `.nvmrc`
- Frontend `.env` and backend `.env` updated to point to coredb URL and keys
- `FRONTEND_URL` in backend `.env` set to `https://folio.ailab.build` for production CORS

---

## [0.1.0] — 2026-05-24

### Added

**Infrastructure**

- Monorepo structure: `frontend/`, `backend/`, `supabase/`
- Supabase migration `001_initial.sql` — tables, RLS policies, new-user trigger
- First registered user is automatically granted admin + approved status
- Subsequent users start as pending and require admin approval

**Backend**

- Express 4 + TypeScript API server (Railway-ready)
- JWT authentication middleware via Supabase `getUser()`
- Portfolio CRUD endpoints with ownership enforcement
- Trade CRUD endpoints with manual entry and PDF import
- Moomoo AU monthly statement PDF parser (trades, dividends, interest)
- Holdings calculation — FIFO cost basis per security
- Capital gains calculation — Australian CGT rules with 50% discount for assets held > 12 months
- Performance data endpoint — portfolio value time series with date range presets (YTD, 1Y, 2Y, 3Y, 5Y, ALL, custom)
- Benchmark data — ASX 200 (^AXJO), S&P 500 (^GSPC), NASDAQ (^IXIC) via yahoo-finance2
- Statistics endpoint — Sharpe ratio, Sortino ratio, Beta, Max Drawdown, Correlation vs S&P 500, Winning Months %, Standard Deviation
- Tax report endpoint — configurable financial year (Jul–Jun or Jan–Dec)
- Dividend report endpoint
- Diversity report endpoint — sector, type, country breakdowns
- Monthly profit endpoint
- Admin endpoints — list users, approve, reject
- Rate limiting, CORS, Helmet security headers
- 26 backend tests (Jest + ts-jest), all passing

**Frontend**

- Vite 8 + React 18 + TypeScript SPA (Cloudflare Pages-ready)
- Tailwind CSS with Apple-inspired design system
- Google OAuth login via Supabase Auth
- Pending-approval page for unapproved users
- Dashboard — portfolio summary, top holdings, quick-add trade
- Portfolios — create, edit, delete, switch active portfolio
- Trades — list, filter, add manually, delete
- PDF Import — upload Moomoo statement, preview parsed trades, confirm
- Holdings — current positions with cost base, unrealised P&L, weight
- Performance — line chart with benchmark overlay, date range picker
- Monthly Profit — bar chart of month-by-month profit/loss
- Drawdown — area chart of portfolio drawdown over time
- Statistics — full metrics panel (Sharpe, Sortino, Beta, etc.)
- Tax report — income summary by financial year
- Dividends — dividend and interest payment history
- Capital Gains — CGT report with long/short term breakdown
- Diversity — pie charts by sector, asset type, country
- Admin — user list with approve/reject actions
- Settings — chart library toggle (Recharts / ECharts, live-switch), financial year preference
- Recharts (default) and Apache ECharts chart implementations — all chart pages render in both
- 59 frontend tests (Vitest), all passing

**Documentation**

- `README.md` — setup, architecture, deployment guide
- `CHANGELOG.md` — this file
- `PROMPT.md` — original product specification
