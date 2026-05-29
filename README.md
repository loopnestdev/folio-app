# Folio App

A portfolio tracking web application for self-directed investors. Track trades, dividends, capital gains, and benchmarks — with full Australian CGT support and Moomoo PDF import.

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
- **Role-based access** — admin approves new users; first user is automatically admin
- **Google OAuth** — via Supabase Auth

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite 8, React 18, TypeScript, Tailwind CSS |
| State / Queries | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts v2 + Apache ECharts v5 |
| Backend | Node.js 20, Express 4, TypeScript |
| Database | Supabase (PostgreSQL) with RLS |
| Auth | Supabase Auth + Google OAuth |
| PDF Parsing | pdf-parse |
| Market Data | yahoo-finance2 |
| Deployment | Cloudflare Pages (frontend), Railway (backend) |

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project with Google OAuth enabled
- Railway account (backend)
- Cloudflare Pages account (frontend)

### Environment Variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
FRONTEND_URL=https://your-app.pages.dev
PORT=3001
```

**Frontend** (`frontend/.env`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=https://your-backend.railway.app
```

### Database Setup

Apply the migration in Supabase SQL editor:
```
supabase/migrations/001_initial.sql
```

### Local Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Tests

```bash
# Backend (Jest)
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

1. Connect your Railway project to the `backend/` directory
2. Set environment variables in Railway
3. Deploy — Railway uses `npm start` (`node dist/index.js`)

### Frontend (Cloudflare Pages)

1. Connect your Cloudflare Pages project to the `frontend/` directory
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set environment variables in Cloudflare Pages dashboard

## Architecture

```text
Browser → Cloudflare Pages (React SPA)
                ↓ API calls
         Railway (Express API)
                ↓
         Supabase (PostgreSQL + Auth)
                ↓
         yahoo-finance2 (market data)
```

Row Level Security (RLS) enforces that users can only access their own portfolios and trades. The backend uses a service-role key to compute reports, verify ownership, and write market data.
