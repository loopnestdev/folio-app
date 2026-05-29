# Changelog

All notable changes to Folio App are documented here.

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
