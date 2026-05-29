# Folio App — Product Specification

## Overview

A portfolio tracking web application for self-directed investors using the Moomoo broker in Australia. The app provides trade tracking, tax reporting, benchmarking, and investment analytics — similar in scope to Sharesight.

## Core Requirements

### Portfolio Management

- Users can create multiple named portfolios (e.g. "Personal Investment", "Retirement")
- All data (trades, reports, holdings) is scoped to the active portfolio
- Portfolios store a default currency (AUD default)

### Trade Input

- Manual entry via form (symbol, direction, type, qty, price, fees, date, currency)
- PDF import from Moomoo Securities Australia monthly account statements
  - Extracts trade executions (Buy to Open / Sell to Close)
  - Extracts dividends (Asset Adjustment entries)
  - Extracts interest (Coupon entries)
  - Extracts fees

### Authentication & Authorisation

- Google OAuth via Supabase Auth
- New users must be approved by an admin before accessing the app
- First registered user becomes admin automatically
- Two roles: admin (approves users, views all data) and standard (views own data only)
- Protected by Cloudflare (frontend) and Express JWT middleware (backend)

### Charts

- Two chart libraries: Recharts (default) and Apache ECharts
- Users can switch between them in Settings — all charts update immediately
- No known security vulnerabilities in either library

## Reports

### Performance

- Total portfolio return over any date range: YTD, 1Y, 2Y, 3Y, 5Y, custom, total since inception
- Benchmarked against: ASX 200 (^AXJO), S&P 500 (^GSPC), NASDAQ (^IXIC)
- Line chart with benchmark overlay

### Holdings

- Current positions with quantity, average cost, current price, market value
- Unrealised gain/loss per holding ($ and %)
- Portfolio weight per holding

### Statistics

- Total Return (Annualised)
- Winning Months (%)
- Max Drawdown (Monthly)
- Standard Deviation (Monthly)
- Sharpe Ratio (RBA cash rate as risk-free rate)
- Sortino Ratio
- Beta (vs. ASX 200)
- Correlation vs. S&P 500

### Monthly Profit

- Bar chart of month-by-month profit/loss
- Best/worst month, total profit summary

### Capital Gains Tax (CGT)

- Australian CGT rules: FIFO matching
- 50% discount applied to assets held > 12 months with positive gain
- Short-term vs. long-term breakdown
- Configurable financial year: 1 Jul – 30 Jun (default) or 1 Jan – 31 Dec

### Tax Report

- Dividends and interest totals for tax purposes
- Brokerage fees (deductible)
- Configurable financial year

### Dividends & Interest

- Full history of dividend and interest payments
- Totals per security and across portfolio

### Diversity

- Sector breakdown (pie chart)
- Asset type breakdown
- Country/market breakdown
- ETF holdings transparency (planned)

### Expected Dividends (planned)

- Upcoming expected dividend payments to help predict cash flow

## Architecture

```text
Browser
  └── Cloudflare Pages (React SPA — Vite 8, React 18, TypeScript)
        └── Railway (Express 4 API — Node.js 20, TypeScript)
              └── Supabase (PostgreSQL + Auth + RLS)
                    └── yahoo-finance2 (market data: prices, benchmarks)
```

### Security

- Row Level Security (RLS) at database level — users cannot access others' data
- Backend verifies Supabase JWT on every request
- Service-role key used only in backend (never exposed to browser)
- CORS restricted to frontend origin
- Rate limiting on all endpoints; stricter limit on PDF upload

## Tech Stack

| Component | Choice |
| --- | --- |
| Frontend | Vite 8, React 18, TypeScript |
| Styling | Tailwind CSS (Apple-inspired design system) |
| Charts | Recharts v2 + Apache ECharts v5 |
| Forms | React Hook Form + Zod |
| State | TanStack Query v5 |
| Auth client | @supabase/supabase-js v2 |
| Backend | Express 4, TypeScript, tsx (dev) |
| PDF parsing | pdf-parse |
| Market data | yahoo-finance2 |
| Database | Supabase PostgreSQL |
| Tests | Vitest (frontend), Jest + ts-jest (backend) |
| Deployment | Cloudflare Pages (frontend), Railway (backend) |

## Design System

Apple-inspired minimal aesthetic:

- Primary: `#0066cc`
- Ink (text): `#1d1d1f`
- Parchment (background): `#f5f5f7`
- Canvas (card): `#ffffff`
- System font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif`
- Card radius: 18px
- Button style: pill-shaped
- No decorative gradients or drop shadows
