# Changelog

All notable changes to Folio App are documented here.

## [v0.3.3] — 2026-05-30

### Changed

- **Dark mode is now the default** — First-time visitors (no saved preference) get dark mode instead of light. The no-flicker inline script in `index.html` and `useTheme` hook both treat a missing `folio-theme` localStorage key as `dark`. Returning users who explicitly chose light are unaffected. (`frontend/index.html`, `frontend/src/hooks/useTheme.ts`)

## [v0.3.2] — 2026-05-30

### Added

- **Forex rate lookup** — `GET /api/forex?from=USD&to=AUD&date=YYYY-MM-DD` endpoint returns the historical exchange rate for any currency pair using Yahoo Finance. Searches a ±5-day window so weekends and market-close days are handled. Falls back to the inverse pair (`USDAUD=X` → `AUDUSD=X` inverted) if the direct symbol is unavailable. (`backend/src/routes/forex.ts`, `backend/src/services/market-data/yahoo.ts`)

- **TradeForm forex section** — When a trade's currency differs from the portfolio's base currency, the Add Trade form now shows an FX Conversion panel. The exchange rate is auto-fetched for the selected trade date and pre-filled. Users can override it manually. The AUD-equivalent amount is shown live alongside a note that it is used for the CGT cost base (ATO requirement). (`frontend/src/components/forms/TradeForm.tsx`, `frontend/src/hooks/useForex.ts`)

- **PDF import forex enrichment** — The `/import/parse` (and legacy `/import`) endpoint now auto-fetches historical forex rates for each foreign-currency trade in the PDF. The preview table shows an FX Rate column when the statement contains multi-currency trades. (`backend/src/routes/trades.ts`, `frontend/src/pages/ImportPage.tsx`)

### Fixed

- **Blank page after portfolio creation / on dashboard load** — `useHoldings` returned the full `{ holdings, summary }` response object instead of the array. Both `DashboardPage` and `HoldingsPage` called `.filter()` / `.reduce()` on it immediately, throwing `r.filter is not a function` and crashing the render tree. Fixed by extracting `data.holdings` in the hook. (`frontend/src/hooks/usePortfolio.ts`)

- **Dashboard recent-trades columns showing stale field names** — `DashboardPage` still referenced pre-refactor Trade fields (`direction`, `symbol`, `amount`). Updated to `trade_type`, `security?.symbol`, and computed total (`price × quantity + brokerage`). (`frontend/src/pages/DashboardPage.tsx`)

- **CGT calculation ignoring exchange rates** — `calculateCapitalGains` and `calculateHoldings` now apply `exchange_rate` to compute AUD-equivalent cost bases (buy side) and proceeds (sell side), matching ATO requirements: cost base uses the exchange rate at the time of purchase; proceeds use the rate at the time of sale. (`backend/src/services/calculations/holdings.ts`)

- **Import parse URL mismatch** — Frontend called `/import/parse` but the backend only had `/import`. Added `/import/parse` as the canonical route with `/import` as a legacy alias. (`backend/src/routes/trades.ts`)

- **`useTrades` returning paginated object instead of array** — Backend wraps trades in `{ data, total, page, limit }` but the hook returned the whole object. Fixed to extract `data.data`. (`frontend/src/hooks/usePortfolio.ts`)

- **Frontend Trade type misaligned with backend schema** — Frontend had a divergent Trade interface (with `direction`, `amount`, `fees`, old `TradeType` enum). Aligned to the exact backend schema (`trade_type: BackendTradeType`, `brokerage`, `gst`, `exchange_rate`, joined `security` object). Updated TradesPage columns accordingly. (`frontend/src/types/index.ts`, `frontend/src/pages/TradesPage.tsx`)

- **ParsedTrade type misaligned with backend parser output** — Updated to match the actual Moomoo parser output (`trade_type` as backend enum, `brokerage`, `gst`, `exchange_rate`). (`frontend/src/types/index.ts`)

## [0.3.1] — 2026-05-30

### Added

- **Stripe-inspired design system** — Full design overhaul replacing the Apple-inspired palette. All 44 frontend files migrated from hardcoded Apple hex values (`#0066cc`, `#1d1d1f`, `#f5f5f7`) to semantic CSS custom properties (`--c-primary`, `--c-ink`, `--c-canvas-soft`). New Stripe color tokens: indigo primary (`#533afd`), deep navy ink (`#0d253d`), cloud-white canvas (`#f6f9fc`).

- **Dark / light mode toggle** — `useTheme` hook (`frontend/src/hooks/useTheme.ts`) backed by `localStorage` key `folio-theme`. Preference persists across sessions. An inline `<script>` in `index.html` applies the saved theme before first paint — no flash of wrong theme. Toggle button (Sun/Moon icon) lives in the top-right of the topnav.

- **Plus Jakarta Sans font** — Replaced `system-ui / SF Pro` with `Plus Jakarta Sans` (body, headings) + `JetBrains Mono` (monospace/numeric cells), loaded via Google Fonts. Matches the moat-finder app.

- **`frontend/src/lib/colors.ts`** — Typed `C.*` token constants exposing all `var(--c-*)` CSS properties for use in inline styles and ECharts/Recharts theme configs. Includes `gainColor(value)` helper.

- **`frontend/src/hooks/useTheme.ts`** — `{ dark, toggle }` hook. Sets `data-theme="dark"` on `<html>`; all design tokens switch automatically via CSS custom property overrides in `[data-theme="dark"]`.

### Changed

- **Topnav** — Black bar replaced with white/dark-aware header with Stripe-style hairline border. Sun/Moon toggle added. All hardcoded colors replaced with CSS var tokens.
- **All UI primitives** (Button, Card, Badge, Input, Select, Modal, Table, StatCard, Toast, DateRangePicker, LoadingSpinner) — Stripe color palette; dark mode aware.
- **All pages and charts** — Stripe palette; chart series colors updated to Stripe green/red/amber/indigo.

## [0.3.0] — 2026-05-30

### Fixed

- **Google OAuth login stuck on "Authenticating..." forever** — Root cause was a circular deadlock introduced by Supabase JS v2's newer `_notifyAllSubscribers` awaiting subscriber callbacks. The Axios request interceptor called `supabase.auth.getSession()`, which awaits `initializePromise`, which awaits the `onAuthStateChange` callback, which awaited `fetchProfile()`, which awaited `api.post()`, which hit the interceptor again — infinite loop. Fixed by replacing the async `getSession()` interceptor with a synchronous token store (`setAuthToken()`/`_authToken`) updated directly in the `onAuthStateChange` callback before any async work. (`frontend/src/lib/api.ts`, `frontend/src/contexts/AuthContext.tsx`)

- **Profile bootstrap never completing (profiles table permanently empty)** — The Railway→Supabase auth API call (`getUser()`) was not slow by itself; it was blocked by the deadlock above, causing 30-second axios timeouts before any DB work could begin. The profiles table was always empty because the INSERT code was never reached. Fixed by resolving the deadlock. (`backend/src/routes/auth.ts`)

- **Profile role/status overwritten on every re-login** — `POST /api/auth/profile` used `upsert()` with all fields including `role` and `status`, resetting the admin profile to `role=standard, status=pending` on each sign-in after the first. Fixed: existing profiles now only update metadata (`email`, `full_name`, `avatar_url`); role and status are preserved. (`backend/src/routes/auth.ts`)

- **Content Security Policy blocking Supabase JS and Cloudflare Bot Management** — Added `frontend/public/_headers` to override stale Cloudflare-cached CSP. Added `'unsafe-eval'` (Supabase JS requirement) and `'unsafe-inline'` (Cloudflare Bot Management inline script injection) to `script-src`. Added `Cross-Origin-Opener-Policy: same-origin-allow-popups` for Google OAuth.

- **Duplicate CSP headers from Cloudflare dashboard rule** — Two simultaneous `Content-Security-Policy` headers caused browsers to enforce the intersection (most restrictive), blocking `'unsafe-eval'` even when the `_headers` file allowed it. Resolved by updating the Cloudflare rule to match `_headers`.

- **`detectSessionInUrl: false` forcing implicit OAuth flow** — Setting caused Supabase to skip PKCE and deliver `#access_token=` in URL hash instead of `?code=` query param. Removed; library now handles PKCE automatically. (`frontend/src/lib/supabase.ts`)

- **Double `fetchProfile()` calls on initial load** — `getSession()` + `onAuthStateChange` both firing on subscribe caused concurrent profile requests. Removed the redundant `getSession()` call; added `fetchingRef` guard. (`frontend/src/contexts/AuthContext.tsx`)

- **401 auto-signout loop on profile endpoint** — Response interceptor was signing out the user on any 401, including transient errors on `POST /api/auth/profile`. Excluded `/auth/profile` from the auto-signout path. (`frontend/src/lib/api.ts`)

### Performance

- **Local JWT verification for HS256 tokens** — Backend now attempts local HMAC-SHA256 verification before falling back to the Supabase `getUser()` network call. Detects ES256 tokens (migrated projects) and routes them to the network fallback automatically. Supabase displays the JWT secret as base64url; key is decoded before use. (`backend/src/lib/verifyJwt.ts`)

- **Eliminated Railway→Supabase latency bottleneck** — Once the frontend deadlock was fixed, profiling confirmed the `getUser()` network call from Railway is fast (<500ms). The 30-second hangs were entirely caused by the client-side deadlock, not network latency.

### Added

- `backend/src/lib/verifyJwt.ts` — In-process HS256/ES256-aware JWT verifier using Node's built-in `crypto` module. No external JWT library needed.
- `backend/src/app.ts` — `/health/db` endpoint measuring Railway→Supabase PostgREST latency (23ms); `/health/jwt` endpoint confirming `SUPABASE_JWT_SECRET` is loaded.
- `backend/package.json` — Added `typecheck` script (`tsc --noEmit`).
- `SUPABASE_JWT_SECRET` Railway environment variable — Required for local JWT verification fast path.

---

## [0.2.1] — 2026-05-29

### Fixed

- **Cloudflare deployment serving "Hello World" / redirect loop** — `frontend/wrangler.toml` used the deprecated `[site]` format (Wrangler v3+ deploys a stub worker with this config). Migrated to `[assets]` format with `not_found_handling = "single-page-application"` for React Router deep-links. Removed `public/_redirects` (`/* /index.html 200`) — that rule is Cloudflare Pages syntax and causes error 100324 (infinite redirect loop) in Workers Assets.

- **Google OAuth sign-in returning to login without a session** — The `/auth/callback` route was wired to `<Navigate to="/" replace />`, which immediately navigated away and discarded the `?code=` PKCE parameter before Supabase could exchange it for a session. Added `AuthCallbackPage.tsx` that calls `supabase.auth.exchangeCodeForSession(code)` before navigating, completing the Supabase v2 PKCE flow correctly.

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
