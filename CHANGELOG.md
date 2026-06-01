# Changelog

All notable changes to Folio App are documented here.

## [Unreleased]

### Fixed

- **Group performance chart: ASX stocks looked up without exchange suffix, causing wrong prices** — The group `/performance` and drawdown endpoints called `getHistoricalPrices` without the `exchange` parameter. For ASX-listed symbols, this meant Yahoo Finance received the raw ticker (e.g. `EQR`) instead of the exchange-qualified form (`EQR.AX`), and returned the wrong company entirely — in this case Equity Residential (NYSE: EQR, ~A$61/share) instead of the small ASX stock (A$0.315/share). The 1,600-share EQR position was valued at ~A$97,600 instead of ~A$504, spiking the group TWR chart to +2250% on the day of purchase and creating a phantom –91% max drawdown when the position corrected. Fixed by passing `sec?.exchange` to all affected `getHistoricalPrices` calls, matching the pattern already used consistently in `reports.ts`. (`backend/src/routes/groups.ts`)

- **Price history cache contained wrong NYSE:EQR prices** — Even after the exchange parameter fix, the performance chart continued spiking because 494 stale price rows for `EQR` (fetched earlier as NYSE: Equity Residential, $58–$78/share) were cached in `price_history` under EQR's `security_id`. The cache check fires before the Yahoo Finance call, so the corrected `EQR.AX` fetch was never reached. Resolved by directly deleting all `price_history` rows for the EQR security; the next request will re-fetch via `EQR.AX` and cache correct ASX prices.

- **Group dashboard: NAV and YTD return excluded cash balance** — The group summary endpoint calculated NAV as the sum of stock market values only, ignoring cash balance. After a large selloff (e.g. liquidating most US positions in January 2026), the cash proceeds were invisible to the NAV calculation, causing a massive apparent drop in both Net Asset Value and YTD Return. The fix mirrors the individual portfolio logic: `totalValue = investedValue + cash_balance`, and the YTD start value similarly includes the cash balance at 01 Jan. (`backend/src/routes/groups.ts`)

- **PDF import: multiple same-day Bank Transfer Deposits collapsed into one** — When several bank deposits arrive on the same day for the same amount (e.g. 7× A$1,000 on 30 Dec 2025), the dedup key treated them as identical and imported only one. The cash section pattern now captures the HH:MM:SS timestamp for each row and appends it to `notes` for `Bank Transfer Deposits` entries (e.g. `"Bank Transfer Deposits 14:51:09"`), giving every transfer a unique identifier. `Cash In Out` entries already carry unique Zepto payment references and are unaffected. (`backend/src/services/pdf-parser/moomoo.ts`)

## [v0.5.5] — 2026-06-01

### Changed

- **Import page: portfolio context shown in subtitle** — The Import Trades page now displays the target portfolio name and currency directly under the title (e.g. "Importing into **Moomoo Personal Portfolio** (AUD)"), making it immediately clear which portfolio will receive the imported trades. (`frontend/src/pages/ImportPage.tsx`)

### Fixed

- **PDF import: missing trade when symbol renders on its own line** — Some Moomoo PDF statements break the symbol token onto a separate line before the exchange/currency/date line (e.g. `"INUV\n"` then `"US\tUSD\t2025/08/08"`). The parser's 4-token check skipped these trades entirely (e.g. the INUV 500-share buy on 08 Aug 2025 was silently dropped). The parser now detects a single-uppercase-word line as a split symbol and reads the next line for exchange/currency/date. (`backend/src/services/pdf-parser/moomoo.ts`)

- **PDF import: trade missing when currency and date are space-merged on line 2** — Some PDF renders produce `"SYMBOL \t EXCHANGE \t CURRENCY DATE"` (3 tokens, currency and date joined by a space instead of a tab). The parser skipped these trades entirely (e.g. the BITU 27-share sell on 04 Sep 2025). Added a branch that detects this layout and splits the last token to recover the currency and date. (`backend/src/services/pdf-parser/moomoo.ts`)

- **PDF import: Bank Transfer Deposits not recognised** — Direct bank deposits recorded as `Bank Transfer Deposits` in the Changes in Cash section were silently ignored. Added the type to the cash-section pattern; positive amounts are imported as `deposit` trades. (`backend/src/services/pdf-parser/moomoo.ts`)

- **PDF import: Corporate Action cash dividends not parsed** — ETF cash distributions recorded as `Corporate Action` in the Changes in Cash section (e.g. BITU per-share dividend payout) were silently ignored because the pattern only matched `Asset Adjustment | Coupon | Cash In Out | Currency Exchange`. Added `Corporate Action` to the pattern: positive amounts are imported as `dividend` for the named security; negative amounts (withholding tax) are skipped since the gross dividend is the authoritative income figure. (`backend/src/services/pdf-parser/moomoo.ts`)

### Fixed

- **XLSX import: brokerage always $0** — The Moomoo annual XLSX uses the column name `Transaction Fee(Inc.GST)` but the parser was looking for `Bokerage(Inc.GST)` / `Brokerage(Inc.GST)` (both incorrect). Every trade imported via XLSX had brokerage = $0, which understates the cost base and overstates capital gains. Fixed by adding `Transaction Fee(Inc.GST)` as the primary lookup with the old names retained as fallbacks for older file formats. 39 of 49 trades in the 2024–25 file had non-zero fees affected. (`backend/src/services/pdf-parser/moomoo-xlsx.ts`)

- **XLSX import: Cash Overview not parsed** — Bank deposits (ZEPTO_PR PayID references), AUD↔USD internal account transfers, and Moomoo cash vouchers from the Cash Overview sheet were silently ignored. These are external cash flows required for accurate TWR / Modified Dietz calculations. They are now parsed as `deposit` or `withdrawal` trades based on the sign of the amount, with the Comment stored as `notes` for display and deduplication. Stock Cash Coupons are intentionally skipped because they are already captured as dividend/interest trades via the monthly PDF import. (`backend/src/services/pdf-parser/moomoo-xlsx.ts`)

- **XLSX import: multiple same-day same-amount deposits collapsed** — The dedup key for deposit/withdrawal trades was `date|symbol|type|qty|price`, which caused multiple deposits of the same amount on the same day (e.g. three separate $1,000 Zepto transfers) to be treated as duplicates of each other. Both parse-time and confirm-time dedup now include the `notes` field (i.e. the payment reference) for deposit/withdrawal trades, so entries with different Zepto references or transfer comments are correctly treated as distinct trades. (`backend/src/routes/trades.ts`)

- **XLSX import: `mapMarket` never handled `ASX` directly** — Newer Moomoo files emit `Market: "ASX"` while the parser only had explicit cases for `"AU"` → ASX. The `default` branch happened to return `"ASX"` anyway, but the case is now explicit for clarity. (`backend/src/services/pdf-parser/moomoo-xlsx.ts`)

## [v0.5.4] — 2026-06-01

### Changed

- **Report page layout: time-range controls moved below the title** — Monthly Profit, Statistics, Dividends, Drawdown, and Capital Gains pages now follow the same two-row layout as Portfolio Diversity: the Individual / Group switcher stays in the top-right corner of the header, while the date-range picker (YTD / 1Y / 2Y … / Custom) and the Capital Gains FY selectors appear on a second row directly underneath the title. (`frontend/src/pages/reports/MonthlyProfitPage.tsx`, `StatisticsPage.tsx`, `DividendsPage.tsx`, `DrawdownPage.tsx`, `CapitalGainsPage.tsx`)

## [v0.5.3] — 2026-06-01

### Fixed

- **Portfolio Diversity Sector / Type / Country always showing "Other" / "Unknown"** — The `securities` table only stores `symbol`, `name`, `exchange`, and `currency` at trade-import time; `sector`, `asset_type`, and `country` were permanently null. Both the individual and group Diversity endpoints now lazily enrich missing metadata on first load: they call Yahoo Finance `assetProfile` (sector, country) and `quoteType` (Equity / ETF / Mutual Fund …) modules in parallel, persist the results back to the `securities` table, and return enriched data for the current request. Subsequent loads use the cached DB values so there is no extra latency. Country falls back to an exchange → country mapping (ASX → Australia, NYSE/NASDAQ → United States, etc.) for ETFs and other instruments that have no `assetProfile`. (`backend/src/services/market-data/yahoo.ts`, `backend/src/routes/reports.ts`, `backend/src/routes/groups.ts`)

### Changed

- **Report pages default to Group view** — When a user has at least one portfolio group the Individual / Group switcher now opens in Group mode instead of Individual mode, so the aggregate view is the first thing seen. (`frontend/src/hooks/useReportViewSwitcher.ts`)

### Fixed

- **Dividends page showing CASH transactions** — Deposits, withdrawals, and broker cash-management entries recorded against the synthetic CASH security were appearing in the Payment History table. Both the individual and group endpoints now exclude any transaction whose security symbol is `CASH`. (`backend/src/routes/reports.ts`, `backend/src/routes/groups.ts`)

- **Individual / Group switcher layout inconsistency** — In Individual mode the portfolio dropdown was wrapping to a second line while in Group mode the group dropdown stayed inline. Removed `flex-wrap` from the switcher container so the toggle and dropdown are always side-by-side. (`frontend/src/components/ui/ReportViewSwitcher.tsx`)

## [v0.5.2] — 2026-06-01

### Added

- **Option A: Individual / Group context switcher on all 8 report pages** — Every report page now shows an "Individual · Group" toggle (visible only when the user has at least one portfolio group). Switching to Group aggregates data across all portfolios in the selected group and converts amounts to the group's base currency. New group-level backends added for all previously missing reports: Dividends, Diversity, Drawdown, and Statistics. Existing group Performance, Monthly Profit, Capital Gains, and Tax backends are reused. The switcher auto-selects the group the current portfolio belongs to when switching modes. (`frontend/src/components/ui/ReportViewSwitcher.tsx`, `frontend/src/hooks/useReportViewSwitcher.ts`, `backend/src/routes/groups.ts`)

### Fixed

- **Individual portfolio report pages all returning empty data** — Capital Gains, Tax, Dividends, Diversity, and Upcoming Dividends pages were silently broken: their hooks call `/reports/` prefix API paths (e.g. `/api/portfolios/:id/reports/capital-gains`) but the backend only exposed the old paths without that prefix (e.g. `/:id/capital-gains`). Additionally, the old routes returned wrong response shapes (`{ lots, summary }` instead of `CapitalGain[]`, `{ items, total }` instead of `DividendSummary`, etc.). Added five correct `/reports/` prefix routes with properly shaped responses matching the frontend types. (`backend/src/routes/reports.ts`)

- **TaxPage stat cards showing dollar amounts as trend percentages** — Same `trend={dollar_amount}` bug fixed for Capital Gains in v0.5.0 and Monthly Profit in this cycle. Removed `trend` from all six stat cards in TaxPage. (`frontend/src/pages/reports/TaxPage.tsx`)

### Added

- **Monthly Profit report: backend route was completely missing** — `GET /api/portfolios/:id/reports/monthly-profit` did not exist, causing every Monthly Profit page to silently show empty data. Now implemented using Modified Dietz: `profit = end_value − start_value − net_flows`, `return_pct = profit / (start_value + 0.5 × net_flows) × 100`. Both invested value and cash balance are included. (`backend/src/routes/reports.ts`)

- **Drawdown report: backend route was completely missing** — `GET /api/portfolios/:id/reports/drawdown` did not exist. Now implemented as a rolling peak-to-trough percentage: the peak is tracked from full history so the rolling maximum is accurate even when the display range starts mid-portfolio. (`backend/src/routes/reports.ts`)

- **Group Monthly Profit page** — New `GET /api/groups/:id/monthly-profit` endpoint aggregates month-by-month P&L across all portfolios, converting each to the group's `base_currency` at today's FX rate. Frontend: new `GroupMonthlyProfitPage` at `/groups/:id/monthly-profit`, linked from the group dashboard (header link row and table footer). (`backend/src/routes/groups.ts`, `frontend/src/pages/groups/GroupMonthlyProfitPage.tsx`, `frontend/src/hooks/useGroupReports.ts`)

## [v0.5.1] — 2026-06-01

### Added

- **Report pages now show active portfolio name in subtitle** — All 8 report pages (Performance, Monthly Profit, Statistics, Tax, Dividends, Capital Gains, Diversity, Drawdown) append the active portfolio name to their subtitle, e.g. "Portfolio returns over time · Moomoo Personal USD". Resolves confusion when switching between portfolios — it's no longer ambiguous which portfolio's data is being displayed. Group report pages are unchanged (the group name already appears in the back-navigation link). (`frontend/src/pages/reports/*`)

### Fixed

- **AUD portfolio chart: overdraft-leverage zombie resumption (−99.17% crash)** — After the AUD→USD FX withdrawal, the cash balance went deeply negative (−A$13,522) while ASX stocks still held positive value (A$14,000), leaving a net portfolio of only A$478. Because both `adjustedBase` and `totalValue` were positive on the withdrawal day, `chainBroken` never fired — the TWR chain continued. As ASX stocks subsequently fluctuated, the portfolio oscillated between barely-positive and negative `totalValue`. Every time `totalValue` went negative the null branch fired and `prevValue` was frozen at the prior small value (e.g. A$478). The next day a slight stock recovery pushed `totalValue` barely positive (e.g. A$35), computing a catastrophically small factor (35/478 = 0.073 → −93% single-day drop). A subsequent recovery then computed a massive positive factor (478/35 = 13.7x), creating the oscillating zombie chart. Fixed by adding a third chain-break condition checked *before* the valid/null branch split: `cashBalance < 0 && totalValue < -cashBalance` — fires when negative cash (from any source) is larger than the total portfolio value. `cashBalance` is now exposed from `portfolioValues` for this purpose. (`backend/src/routes/reports.ts`)

### Changed

- **Group Capital Gains + Tax: FX conversion now uses disposal-date rate (ATO-compliant)** — Previously the group `/capital-gains` and `/tax` endpoints fetched a single "today's rate" per currency and applied it to every lot regardless of when it was sold. The ATO requires the exchange rate at the date of each disposal. Now each CGT lot is converted at its own `sell_date` FX rate. Unique `(currency, sell_date)` pairs are collected upfront and fetched in parallel (deduplicated) so the Yahoo Finance API is called at most once per pair — no extra latency for portfolios with no foreign-currency CGT. The `fx_rate` field on each lot now reflects the disposal-date rate; the per-portfolio display `fx_rate` in the Tax report remains today's rate (informational only). Dividend/interest income in the Tax report continues to use today's rate (income is not a disposal). (`backend/src/routes/groups.ts`)

## [v0.5.0] — 2026-06-01

### Fixed

- **Group Capital Gains total incorrect for multi-currency groups** — The stat cards summed `net_gain` values from all portfolio lots (AUD + USD) as if they were the same currency, producing a mixed-currency total. E.g. A$2,420 + US$1,867 = 4,287 (wrong) instead of A$2,420 + A$2,597 (FX-converted) = A$5,017. Fixed by fetching current FX rates in the group capital gains endpoint and adding `fx_rate`, `net_gain_base`, and `gross_gain_base` fields to each lot. The frontend stat cards now sum `net_gain_base` so the total matches the Tax Report. (`backend/src/routes/groups.ts`, `frontend/src/pages/groups/GroupCapitalGainsPage.tsx`)

- **Capital Gains / Tax Report stat cards showing dollar amounts as percentage trend** — `trend={shortTerm}` passed a dollar amount (e.g. 4286.55) to `StatCard.trend`, which formats it as a percentage "+4286.55%". These trend indicators make no sense for capital gain dollar totals. Removed `trend` from all capital gains and tax stat cards. (`frontend/src/pages/groups/GroupCapitalGainsPage.tsx`, `frontend/src/pages/groups/GroupTaxPage.tsx`)

- **Default financial year was January–December instead of July–June (AU)** — New users without a saved preference defaulted to calendar-year FY, so the Capital Gains and Tax pages opened on the wrong year type. Changed the fallback in `SettingsContext` from `'jan-dec'` to `'jul-jun'`. (`frontend/src/contexts/SettingsContext.tsx`)

- **Individual portfolio Capital Gains page: DateRange picker was non-functional** — The backend `/reports/capital-gains` endpoint only reads `fyStart` and `year` query params, but the frontend was sending `start_date`/`end_date` via `dateRangeToParams`. The date range was silently ignored and all gains always used the backend defaults. Fixed `useCapitalGains` hook to send `fyStart`+`year`. Replaced the non-functional DateRange picker on `CapitalGainsPage` with FY Type + Year selectors matching the group page. Reads preferred FY type from `SettingsContext`. Removed bogus `trend` props from stat cards. (`frontend/src/hooks/useReports.ts`, `frontend/src/pages/reports/CapitalGainsPage.tsx`)

- **TypeScript build failure: `net_gain_base` / `gross_gain_base` missing from `GroupCapitalGain` type** — Added `fx_rate`, `net_gain_base`, and `gross_gain_base` fields to the `GroupCapitalGain` interface. (`frontend/src/types/index.ts`)

- **AUD portfolio chart: zombie TWR resumption after overdraft (permanent-overdraft detection)** — The original `chainBroken` check (`extFlow < 0 && adjustedBase ≤ 0`) only fires when the withdrawal directly exceeds `prevValue`. In the AUD case `prevValue` was inflated by +150% TWR growth, so `adjustedBase` stayed positive even after the A$14,022 withdrawal. The chain kept running through the subsequent ASX stock decline; once stocks dropped far enough to make `totalValue ≤ 0` the chain froze, then "zombie-resumed" whenever prices briefly pushed `totalValue` back above zero, producing catastrophic downward factors. Fixed by adding a second break condition: when `totalValue ≤ 0 AND getNetDepAt(date) < 0` (more has been withdrawn than deposited), the chain is permanently broken. This specifically targets permanent overdraft portfolios (netDep < 0) while leaving normal portfolios that simply experience a temporary price dip unaffected. (`backend/src/routes/reports.ts`)

- **AUD portfolio chart: zombie TWR resumption after overdraft withdrawal** — After an FX withdrawal drove `adjustedBase ≤ 0` (withdrawal exceeded portfolio value), the chain was frozen with a large `prevValue` from the portfolio's peak. On later dates when ASX stock prices briefly pushed `totalValue` slightly positive (overcoming the deeply-negative cash balance), the chain would resume and compute `factor = tiny_totalValue / large_prevValue` → catastrophic downward spike (e.g. −87%). Fixed by introducing a `chainBroken` flag: once `extFlow < 0 && adjustedBase ≤ 0` (a withdrawal exceeded the last valid portfolio value), the chain is permanently terminated and all subsequent dates push null. The AUD portfolio chart now correctly shows valid data from Aug–Nov 2024, then a permanent gap — no phantom crash values. (`backend/src/routes/reports.ts`)

- **Group chart: start display from last valid run — skip pre-gap AUD-only history** — The group `portfolioGain` series has two valid segments: Jun–Nov 2024 (AUD stocks only) and Jan 2025+ (USD-dominated after the FX transfer). Selecting "All" range was displaying both segments connected by a dashed null line, producing a confusing chart with a −100% dip and a jump. Added "last-run-start" detection: after computing `portfolioGain`, find the last null→non-null transition in the series and use that date as the effective `displayFrom`. Benchmarks are fetched from the same date so they also start at 0% at the same reference point. Short-range views (1Y, YTD) are unaffected because their `fromDate` already falls within the last valid run. For groups with no null gaps (normal case), the last run start is the `chartStartDate` itself — identical to prior behaviour. (`backend/src/routes/groups.ts`)

- **Group chart: reverted weekend-remapping in group extFlow to restore same-day FX-transfer cancellation** — The weekend-remapping added in the previous fix (`f663089`) shifted each portfolio's flows to its own next price date. Because the AUD and USD portfolios have different trading calendars (ASX vs NYSE), the same-date FX transfer (AUD withdrawal + USD deposit recorded on the same day) was remapped to two *different* dates — breaking the natural cancellation that makes the group chart smooth. Removed the per-portfolio weekend remapping from the group performance endpoint and restored the direct `extFlowByDate[date]` lookup (matching the `44c0efb` state). Flows on non-price-date days are silently absent from the priceMap and dropped from extFlow, which is acceptable at the group level because `getCashAt()` still captures their economic effect in `totalValue`. (`backend/src/routes/groups.ts`)

- **Portfolio dashboard showed "No performance data" for portfolios with old active periods** — The portfolio overview page used a hard-coded `range: '1Y'` for its performance chart. For the AUD portfolio, whose only valid TWR data is Aug–Nov 2024 (before the FX withdrawal pushed the adjusted base negative), the 1Y display window (Jun 2025–Jun 2026) contains zero valid data points → `dispIdx = -1` → empty response → "No performance data". Fixed by changing the dashboard default to `range: 'ALL'` so every portfolio's historical active period is visible. (`frontend/src/pages/DashboardPage.tsx`)

- **TWR null-gap prevValue strategy finalised** — After testing three approaches that all produced astronomical values (+1650%, +315,000%) in the AUD portfolio and group chart, reverted to the correct original behaviour: **freeze prevValue in all null-gap branches**. Mutating prevValue during null periods (either to `totalValue` or to `prevValue + extFlow`) causes the first valid day after the gap to see a near-zero `adjustedBase` relative to a large `totalValue`, producing enormous factors. Frozen prevValue correctly measures recovery relative to the last valid portfolio state — which is the GIPS-compliant TWR baseline. The AUD portfolio shows valid data for Aug–Nov 2024 (before the FX overdraft), then a null gap permanently. The group chart shows a step-adjust on the USD deposit day (the net book cost of the mismatched FX transfer timing), then gradual recovery to the correct +22.5%. (`backend/src/routes/reports.ts`, `backend/src/routes/groups.ts`)

- **AUD portfolio "No performance data" + group chart spikes (stale price-history cache)** — `getHistoricalPrices` had the same coverage-check gap as `getBenchmarkPrices` (fixed earlier). When the performance endpoint now requests prices from `earliestTradeDate` (Aug 2024), the Supabase query returns whatever is cached ≥ fromDate. If the cache was populated by a previous 1Y query it only holds recent data (e.g. Jun 2025+). The function saw `cached.length > 5` and returned the short window, leaving the full pre-history empty. For the AUD portfolio this meant the priceMap had zero entries before the FX-withdrawal date, so every portfolioValues entry had negative totalValue and `chartStartIdx = -1` → "No performance data". In the group, the AUD portfolio's dateMap was missing all pre-Jun-2025 entries; remapped AUD flows were all dumped on the first AUD price date (Jun 2025), creating phantom multi-thousand-dollar extFlows → group chart spikes. Fixed by adding the same 7-day coverage check to `getHistoricalPrices`: if the first cached row is more than 7 days after fromDate, the cache is considered stale and a fresh Yahoo Finance fetch is performed. (`backend/src/services/market-data/yahoo.ts`)

- **AUD portfolio chart wild +100%/−100% oscillations and −85% period return** — Root cause: deposits and withdrawals recorded on weekends or public holidays have a `trade_date` that does not exist in the price history map (no market data on those days). `getCashAt(nextTradingDay)` correctly included the weekend flow in the cash balance, but `externalFlowsByDate[nextTradingDay]` was 0 — the denominator (`adjustedBase`) never saw the adjustment. Result: a Saturday deposit of $10k would show as a fake +200% gain on Monday (cash jumped without a denominator change), and a Saturday withdrawal showed as a matching fake crash. Multiple such transactions across the AUD portfolio history created the oscillating chart shape. Fixed in both `reports.ts` and `groups.ts` by remapping every external flow to the **next available price date** on or after its trade date, so the denominator always matches the cash balance. (`backend/src/routes/reports.ts`, `backend/src/routes/groups.ts`)

### Added

- **Group dashboard accessible from sidebar** — Portfolio groups now appear in the left sidebar under a "Groups" section, each linking directly to that group's consolidated dashboard. Previously the only entry point was the tiny "Dashboard" link on the Portfolios page. (`frontend/src/components/layout/Sidebar.tsx`)

- **NASDAQ (and ASX 200) benchmark toggles on Group dashboard** — The group performance chart previously had S&P 500 only with no way to switch. Same toggle-pill UI as the individual Performance page; defaults to NASDAQ on. (`frontend/src/pages/groups/GroupDashboardPage.tsx`)

### Fixed

- **AUD portfolio showed "No performance data available" after date-range fix** — The individual portfolio performance endpoint was using `MAX(fromDate, earliestTrade)` for the historical price fetch start. With 1Y range (fromDate = May 2025) and AUD trading starting Aug 2024, this took May 2025 — so allDates started May 2025 where AUD netDep is permanently negative (FX withdrawals exceeded deposits). `chartStartIdx` returned −1 → empty chart. Fixed: price history is now always fetched from `earliestTradeDate` (the portfolio's very first investment trade) so the TWR chain always finds its starting point. The result is then filtered and re-normalised to the user's selected display window (sub-period TWR: first displayed date = 0%). (`backend/src/routes/reports.ts`)

- **Group chart benchmark lines invisible (NASDAQ / S&P 500 not drawing)** — Two root causes: (1) The benchmark Supabase cache stores data from previous 1Y queries (May 2025 onward), but `getBenchmarkPrices` returned cached rows even when the requested `fromDate` was much earlier (e.g. Aug 2024). The cache rows started months after `fromDate`, so `benchMap` forward-fill had no values for the portfolio's date range → all null → lines absent. Fixed by checking that the first cached row is within 7 days of `fromDate`; if not, the cache is stale and a fresh Yahoo fetch is performed. (2) Group benchmark fetches now happen AFTER the TWR computation, using `[displayFrom, toDate]` (the actual visible window) rather than the raw user `fromDate` — avoiding 26-year fetches for 'ALL' range. (`backend/src/services/market-data/yahoo.ts`, `backend/src/routes/groups.ts`)

- **Date range selector ignored by performance endpoints — always showing ALL data** — The frontend computes the actual start/end dates from the selected range and sends them as `start_date` / `end_date` query params (via `dateRangeToParams`). Both `reports.ts` and `groups.ts` were reading `range` / `from` / `to` — names that never matched — so they always defaulted to `range = 'ALL'` (2000-01-01 to today). This caused: (1) 26 years of historical price data fetched on every request; (2) benchmark data cached for 1Y but queried for 26Y → cache miss → Yahoo Finance fetch for 26Y → timeout → empty array → benchmark lines invisible; (3) custom date ranges completely ignored. Fixed by reading `start_date` / `end_date` directly in both endpoints. (`backend/src/routes/reports.ts`, `backend/src/routes/groups.ts`)

- **Group performance chart showed +4500% spikes** — chart used only holdings market value (no cash) as the group value base. The first stock purchase in Aug 2024 was a small amount (the base), and when large USD deposits arrived in Nov 2024 the group value jumped enormously relative to that base, producing astronomical % readings. Replaced the simple indexed approach with a proper **Time-Weighted Return (TWR)** chain identical to the individual portfolio implementation: each portfolio's daily value is holdings + cash (converted to base_currency); deposits/withdrawals across all portfolios are treated as external flows; FX transfers cancel out (AUD withdrawal + USD deposit = zero net group flow). The TWR chain starts from the first date where group `netDep > 0 AND totalValue > 0`, and pushes `null` gaps when the adjusted base is non-positive. (`backend/src/routes/groups.ts`)

- **Group benchmark lines (NASDAQ / S&P 500) not appearing** — the S&P 500 and NASDAQ use US market trading days, while the AUD sub-portfolio uses ASX trading days. When portfolio dates fell on ASX days that were not US market days, `benchMap[date]` was `undefined` → `null` → the chart line broke. Fixed by forward-filling benchmark values across all portfolio dates: the last available US market price is carried forward to any subsequent ASX-only date. (`backend/src/routes/groups.ts`)

- **Group performance chart showed data from year 2000 with a flat line** — Historical price fetches used `fromDate = 2000-01-01` for the ALL range; stocks like UA have Yahoo Finance data going back to the early 2000s, so `priceMap` contained thousands of pre-portfolio dates all with `value = 0`. The chart started from the first date (year 2000) and divided by zero, producing either a flat 100-indexed line or no meaningful data. Fixed by skipping leading dates where combined portfolio value = 0 and starting the chart from the first date the group had any holdings. (`backend/src/routes/groups.ts`)

- **Group performance chart used 100-indexed scale instead of 0-based % gain** — Backend was returning values like 100, 95, 110 (Normalised to 100 style); the shared `PerformanceChart` component expects 0-based values like 0, −5, +10. This caused the Y-axis to show "+100%" at the start and the tooltip to show nonsensical values. Changed to `(value / baseValue − 1) × 100` (same convention as individual portfolio TWR). Benchmarks also aligned to `chartStartDate` with the same 0-based formula. (`backend/src/routes/groups.ts`)

- **Group YTD return always showed A$0.00** — The group summary was valuing both the current portfolio AND the YTD-start portfolio using the same `currentPrices`, so their difference only captured changes in position composition (new buys/sells) not price movement. Fixed by fetching actual historical prices for the first trading day of the current year and using those to value the Jan 1 portfolio, matching the approach used by the individual portfolio summary endpoint. (`backend/src/routes/groups.ts`)

- **Performance chart tooltip invisible in dark mode** — Recharts tooltip rendered with no background/text colour, so the date and values were illegible on dark backgrounds. ECharts tooltip HTML also lacked explicit colour styling. Both now read CSS custom properties (`--c-canvas`, `--c-ink`, `--c-border`) and apply them explicitly so the tooltip is always readable in both light and dark themes. (`frontend/src/components/charts/PerformanceChart.tsx`)

- **TWR null-gap chain corrupted by prevValue advancing during gap periods** — when `totalValue ≤ 0` (e.g. large IBTC buy exceeded available cash on 2024-11-08), the code pushed `null` (gap) but still set `prevValue = totalValue` (negative). On the next valid day, `adjustedBase = prevValue_negative + extFlow` computed a severely distorted factor, causing the chart to show a flat line at −98% for months after the gap. Fixed: `prevValue` is now only updated inside the `if (adjustedBase > 0 && totalValue > 0)` branch, so the TWR chain resumes from the last valid portfolio value after any gap. (`backend/src/routes/reports.ts`)

- **TWR implementation produced inverted chart (portfolio at −56% despite +58% overall gain)** — TWR formula `value_t / adjustedBase` is mathematically inverted when either value is ≤ 0: negative/negative gives a "positive" factor even when portfolio worsened; positive/negative explodes the chain. The original code started the chain from Aug 2024 with USD portfolio value ≈ −$3 (small stock positions funded before any deposits), making every subsequent factor inverted. Fixed by: (1) finding the first chart date where BOTH `net_deposited > 0` AND `totalValue > 0` — this skips pre-deposit periods entirely; (2) when `adjustedBase ≤ 0` or `totalValue ≤ 0` during the chart (e.g. large FX withdrawal depletes AUD portfolio), push `null` (chart gap) instead of an undefined value. `PerformancePoint.portfolio_value` is now `number | null` to support gaps. (`backend/src/routes/reports.ts`, `frontend/src/types/index.ts`, `frontend/src/pages/reports/PerformancePage.tsx`)

- **Performance chart showed large spikes (e.g. −149% in one day) due to P&L formula sensitivity** — the simple `(total_value − net_deposited) / net_deposited` formula creates extreme swings when `net_deposited` is small relative to position sizes (e.g. AUD swing trades of A$5k against A$3k net deposits). Also, depositing cash without investing would artificially stabilise the %, making the metric "gameable". Replaced with **Time-Weighted Return (TWR)**: chains daily returns `value_t / (value_{t−1} + external_flows_on_t)` so that deposits, withdrawals, and Transfer-In events (broker share transfers at $0 cost) have zero effect on the performance line. TWR is the industry standard (GIPS-compliant). (`backend/src/routes/reports.ts`)

- **Performance chart showed +373,000% / +599,900% (astronomical gain)** — root cause: the chart was normalising `portfolio_total_value` (holdings + cash) against an early-period base that was near-zero (small stock positions funded by negative cash before any deposits arrived). Any later value divided by ~$0 produces infinite %. Switched the chart to a true **P&L gain % baseline**: `(total_value − net_deposited) / net_deposited × 100` — the same formula as the "Overall Gain %" stat card, so the chart end-point always matches the dashboard number. Dates before the first deposit (where `net_deposited ≤ 0`) are skipped entirely. Benchmarks now use the same 0%-baseline (`(price / start_price − 1) × 100`) so all series are directly comparable. (`backend/src/routes/reports.ts`, `frontend/src/components/charts/PerformanceChart.tsx`, `frontend/src/pages/reports/PerformancePage.tsx`)

## [v0.4.0] — 2026-05-31

### Fixed

- **FX transfers not tracked; USD portfolio showed negative cash** — `parseCashSection` previously ignored `Currency Exchange` entries so AUD↔USD transfers were invisible to the cash position calculation. The parser now captures these entries as `deposit` (positive amount, funds arriving) or `withdrawal` (negative amount, funds leaving). The multi-line FX comment (containing direction and rate, e.g. `AUD → USD, rate 0.621`) is collected via look-ahead. Both sides of each FX transfer are in the same PDF; the existing currency filter routes each side to the correct portfolio on import automatically — no manual deposit trades needed. Re-importing Dec-2024 through Jun-2025 statements will fully account for all AUD↔USD funding. (`backend/src/services/pdf-parser/moomoo.ts`)

- **Frontend build failure — unused CardHeader import** — Removed `CardHeader` from the `DashboardPage.tsx` import after it was no longer used in the Performance card redesign. (`frontend/src/pages/DashboardPage.tsx`)

- **Dashboard performance chart appeared flat** — Benchmarks (S&P 500, NASDAQ) were normalised to 100 at their own start date (2000-01-01) while the portfolio was normalised from its first trade (2024). S&P 500 was already at ~380 when the portfolio started, making the portfolio line look completely flat. Fixed by clamping the benchmark fetch date to the portfolio's earliest investment trade date so all series start together. (`backend/src/routes/reports.ts`)

- **YTD return always showed $0** — When no trades exist in the current calendar year, both the current-value and YTD-start-value used identical `currentPrices`, giving a difference of $0. Fixed by fetching actual historical prices for the first trading week of the current year and using those to value the Jan 1 portfolio position. (`backend/src/routes/reports.ts`)

- **Overall Gain % and YTD Return % showed misleading "+0.00%"** — when `net_deposited ≤ 0` (e.g. AUD portfolio where FX withdrawals exceed deposits) or YTD start value ≤ 0, percentage calculations produce meaningless results. Both endpoints now return `null` instead of `0`, and the frontend renders `—` for null trends. (`backend/src/routes/reports.ts`, `frontend/src/pages/DashboardPage.tsx`)

- **YTD Return label had no period context** — renamed from "YTD Return" to "YTD Return (2026)" (dynamic current year) so it is immediately clear the metric covers the calendar year, not the Australian financial year. (`frontend/src/pages/DashboardPage.tsx`)

- **Performance chart showed astronomical % (e.g. +565,948%) for portfolios with pre-deposit trades** — When stock buys occur before any cash deposits are recorded (e.g. Oct 2024 USD trades funded by a pre-existing balance), cash runs deeply negative and total portfolio value ≈ $0 on day 1. Dividing later values by near-zero gives astronomical normalised percentages. Fixed by skipping to the first day where total portfolio value > $1 (`chartStart`) and normalising all series (portfolio + all benchmarks) from that same date, so the 100-baseline is always anchored to a real, stable starting point. (`backend/src/routes/reports.ts`)

- **Performance chart y-axis showed dollar amounts instead of % return** — The chart data is normalised to an index (100 = portfolio start value) so the y-axis should show percentage return (e.g. `+50%`), not currency amounts (e.g. `$600K`). Fixed by replacing `formatCurrency` with a percentage formatter (`fmtReturn`, `fmtReturnAxis`) in both the Recharts and ECharts chart implementations. Tooltips also now show `+50.1%` rather than `$50.10`. (`frontend/src/components/charts/PerformanceChart.tsx`)

- **Performance chart spiky for swing-trading portfolios** — Daily portfolio value only included invested holdings, not cash. When a position was sold, the holding vanished from the chart and cash dropped to $0, creating dramatic spikes. Fixed by pre-computing a running cash balance from the trade history (no extra DB queries) and adding it to the daily invested value so the total portfolio value stays smooth when positions are opened or closed. (`backend/src/routes/reports.ts`)

- **PerformancePage stats showed meaningless dollar amounts** — The stat cards were calling `formatCurrency` on indexed values (where `150` means `+50%` return, not `$150`). Changed "Period Return" and "Peak Value" cards to format as `%`. Added a fourth card showing the selected benchmark's return for the same period. (`frontend/src/pages/reports/PerformancePage.tsx`)

### Added

- **Interactive benchmark toggles on Dashboard** — Performance chart now has clickable S&P 500 / NASDAQ / ASX 200 toggle buttons instead of hardcoded props. NASDAQ is enabled by default. Each button animates to show the benchmark colour when active. (`frontend/src/pages/DashboardPage.tsx`)

- **Parser missed trades when security name wraps to its own line** — Some PDF pages break between the direction line and the symbol/exchange line, pushing the security name onto a standalone line with no tabs. The parser previously misread the security name as the symbol/exchange line, skipping the entire trade (e.g. FANG buy on 2025-04-22 was silently dropped). Fixed by detecting a standalone name-only line and consuming it before reading the symbol/exchange line. (`backend/src/services/pdf-parser/moomoo.ts`)

- **Parser missed trades with space-merged symbol+exchange** — Some tickers (e.g. `IONQ`) render their Line 2 as `IONQ US\tUSD\tDATE` instead of the normal `IONQ\tUS\tUSD\tDATE`. The missing tab collapsed symbol and exchange into one token (3 tokens instead of 4), causing the trade to be silently dropped. Fixed by detecting the 3-token case and splitting on `lastIndexOf(' ')` to recover symbol and exchange. Normal 4-token trades are unaffected. (`backend/src/services/pdf-parser/moomoo.ts`)

## [v0.3.9] — 2026-05-31

### Fixed

- **Statistics page blank screen** — Three root causes: (1) `PortfolioStatistics` type had `max_drawdown_monthly` but the backend returns `max_drawdown`, causing `undefined.toFixed()` to crash; (2) deposit/withdrawal trades were feeding a synthetic `CASH` security into the Yahoo Finance historical-price lookup; (3) no React error boundary meant a single page crash unmounted the entire app including the sidebar. Fixed field name, added `?? 0` guards on all `.toFixed()` calls, filtered deposit/withdrawal from the statistics symbol list, and added `PageErrorBoundary` in `AppLayout` so future page errors show an inline message with a Try Again button. (`frontend/src/types/index.ts`, `frontend/src/pages/reports/StatisticsPage.tsx`, `backend/src/routes/reports.ts`, `frontend/src/components/layout/AppLayout.tsx`)

### Added

- **Import preview: zero-price dedup + Import Another File button** — Zero-price parsed trades (e.g. SI IN transfers) now dedup on date+symbol+type+quantity only, so manually price-corrected transfers aren't re-surfaced on re-import. Added "Import Another File" button to the 0-trade result state. (`backend/src/routes/trades.ts`, `frontend/src/pages/ImportPage.tsx`)

- **Import preview dedup at parse time** — Preview no longer shows already-imported trades. The parse endpoint now checks existing portfolio trades before returning results, so "6 trades found" means 6 genuinely new trades, not "6 including duplicates". A warning banner counts how many were skipped. Zero-trade result shows a context-aware message. (`backend/src/routes/trades.ts`, `frontend/src/pages/ImportPage.tsx`)

- **Cash position & deposit tracking** — PDF parser now captures `Cash In Out` entries as `deposit`/`withdrawal` trade types. `calculateCashPosition()` computes running cash balance from all trades. Holdings API injects a synthetic CASH row so cash appears in the Holdings table and future pie charts. Portfolio summary now includes `cash_balance`, `total_deposited`, `total_withdrawn`, `net_deposited`, `overall_gain`, `overall_gain_pct`. Dashboard shows "Overall Gain" (market value + cash vs total deposited) and "Invested Return" (unrealised gain on securities). New trade types `deposit` and `withdrawal` added throughout (DB migration 008, backend schema, frontend types, TradeForm, filter dropdown). (`supabase-central/migrations/008_cash_trades.sql`, `backend/src/services/calculations/holdings.ts`, `backend/src/services/pdf-parser/moomoo.ts`, `backend/src/routes/reports.ts`, `frontend/src/pages/DashboardPage.tsx`)

## [v0.3.8] — 2026-05-30

### Added

- **ASX .XA fallback for Yahoo Finance** — Some ASX-listed securities trade on Cboe/Chi-X Australia and use `.XA` suffix on Yahoo Finance instead of `.AX` (e.g. `IBTC.XA`). `getCurrentPrice` and `getHistoricalPrices` now try `.AX` first, then fall back to `.XA` automatically. (`backend/src/services/market-data/yahoo.ts`)

- **Holdings show — instead of -100% when price data unavailable** — When Yahoo Finance has no data for a security (e.g. newly-listed ETFs like IBTC.AX), holdings now show `—` for Current Price, Market Value, Unrealized Gain, and Gain % rather than misleading $0.00 / -100%. Total row excludes unpriced holdings from the gain calculation. (`backend/src/services/calculations/holdings.ts`, `backend/src/types/index.ts`, `backend/src/routes/reports.ts`, `frontend/src/pages/HoldingsPage.tsx`)

- **Edit & delete trade routes fixed** — PUT and DELETE were registered as `/trade/:id` but the frontend called `/:portfolioId/trades/:id`. Both backend routes now use the consistent `/:portfolioId/trades/:id` pattern matching GET/POST. (`backend/src/routes/trades.ts`)
- **Edit trade** — Trades page now has a pencil icon per row that opens the trade form pre-populated with existing values. Supports editing any field including price (useful for correcting broker transfer-in cost bases). (`frontend/src/pages/TradesPage.tsx`, `frontend/src/components/forms/TradeForm.tsx`, `frontend/src/hooks/usePortfolio.ts`)

### Fixed

- **Holdings Total row shows A$NaN for Unrealized Gain** — `calculateHoldings()` returns `cost_base` but the frontend `Holding` type and `HoldingsPage.tsx` expected `total_cost`. Since `total_cost` was `undefined`, the reduce sum became `NaN`. Backend now maps `cost_base → total_cost` in the API response; frontend also adds `?? 0` null guard as defence. (`backend/src/routes/reports.ts`, `frontend/src/pages/HoldingsPage.tsx`)

- **Holdings showing $0.00 price / -100% gain for ASX stocks** — Yahoo Finance requires an `.AX` suffix for ASX-listed tickers (`FANG` → `FANG.AX`). Without it, price lookups return nothing (or the wrong US stock). Added `toYahooTicker(symbol, exchange)` helper; all current-price and historical-price calls now pass the exchange so the correct Yahoo ticker is constructed. (`backend/src/services/market-data/yahoo.ts`, `reports.ts`, `groups.ts`)
- **yahoo-finance2 v3 API break** — Package updated from v2 (singleton default export) to v3 (class-based, requires `new YahooFinance()`). Fixed the import to instantiate the class. (`backend/src/services/market-data/yahoo.ts`)

- **PDF trade parsing broken by pdf-parse v2** — `parseTradesSection` was written for pdf-parse v1's newline-per-field output. v2 renders PDF table cells tab-separated on the same line. Rewrote the function for the new 3-line-per-trade format (`Direction<TAB>Name` / `Symbol<TAB>Exchange<TAB>Currency<TAB>Date` / `Time<TAB>Price<TAB>Qty<TAB>Amount`). Also handles grouped trades sharing one subtotal and page-break lines between a trade and its subtotal. (`backend/src/services/pdf-parser/moomoo.ts`)

### Added

- **Gift Share & broker transfer-in import** — The PDF parser now captures all inbound movements from the `Movement - Securities` section, not just "Gift Share" promotions. Any `In` direction entry with a positive quantity is imported as `trade_type='buy'` at `price=0`. Gift Shares get `notes='Gift Share from Moomoo'`; broker transfers (e.g. `SI IN`) get `notes='Transfer In (SI IN) — update cost base'` as a reminder to set the correct cost base. Multiple entries for the same symbol on the same date are aggregated. (`backend/src/services/pdf-parser/moomoo.ts`)

### Fixed

- **XLSX exchange mapping** — The XLSX annual summary parser was mapping US market → `"NYSE"` and HK market → `"HKEX"`, which diverged from the PDF parser (which uses `"US"` and `"HK"` respectively). Both parsers now use the same codes, preventing duplicate security records when the same stock is imported from both file types. (`backend/src/services/pdf-parser/moomoo-xlsx.ts`)

## [v0.3.7] — 2026-05-30

### Added

- **Per-portfolio currency filter on import** — When parsing a Moomoo PDF or XLSX that contains both AUD and USD trades, the backend now filters to only trades matching the portfolio's base currency. Filtered-out trades appear as a yellow warning banner with instructions to import the same file to the other portfolio. (`backend/src/routes/trades.ts`)

## [v0.3.6] — 2026-05-30

### Added

- **XLSX import support** — The import page now accepts Moomoo AU annual financial-year summary `.xlsx` files in addition to monthly PDFs. The new parser reads three sheets: `Transaction Overview` (buy/sell), `Estimated Dividend Overview` (dividends), and `Interest Overview` (interest), normalising Moomoo's date format and column typo (`Bokerage` → brokerage). (`backend/src/services/pdf-parser/moomoo-xlsx.ts`)

### Fixed

- **Import response shape** — `POST /api/portfolios/:id/import/parse` was returning `{ trades, count }` but the frontend `ImportPreview` type expects `{ filename, parsed_count, trades, errors }`. The backend now returns the correct shape, fixing undefined `parsed_count` and `errors` in the preview. (`backend/src/routes/trades.ts`)
- **Trade deduplication on confirm** — `POST /api/portfolios/:id/import/confirm` now skips trades that already exist (keyed on `trade_date + security_id + trade_type + quantity + price`), preventing double-import when a monthly PDF and an overlapping annual XLSX cover the same trades.
- **Import 0-trade UX** — Uploading a file with no importable trades (e.g. account-opening month with only cash deposits) now shows a clear explanatory banner instead of a broken Confirm button. (`frontend/src/pages/ImportPage.tsx`)
- **pdf-parse v2 compatibility** — `pdf-parse` package updated from v1 (bare function export) to v2 (class-based `PDFParse`). Fixed `pdfParse is not a function` runtime crash that was breaking all PDF imports. (`backend/src/services/pdf-parser/moomoo.ts`)

## [v0.3.5] — 2026-05-30

### Added

- **Group-level consolidated reports (Step 3)** — Each portfolio group now has a full reporting suite that aggregates data across all member portfolios and converts non-base currencies at current forex rates.

  - **DB migration `007_group_base_currency.sql`** — Adds `base_currency` (3-char, default `AUD`) to `folio.portfolio_groups`. All group-level reports are expressed in this currency.
  - **`GET /api/groups/:id/summary`** — Consolidated NAV, total return, YTD return, and a per-portfolio breakdown with FX rates applied. (`backend/src/routes/groups.ts`)
  - **`GET /api/groups/:id/performance`** — Consolidated daily performance time series, normalised to 100, with S&P 500 / ASX 200 / NASDAQ benchmarks. Each portfolio's values are converted to the group's base currency at the current forex rate; a carry-forward approach fills dates where one portfolio has no price data. (`backend/src/routes/groups.ts`)
  - **`GET /api/groups/:id/capital-gains`** — All CGT disposal lots from every portfolio in the group, combined into a single list labelled with their source portfolio. Cost base and proceeds use the trade-date exchange rate already stored on each trade. (`backend/src/routes/groups.ts`)
  - **`GET /api/groups/:id/tax`** — Consolidated tax report (dividends, interest, short/long-term CGT, 50% CGT discount) across all portfolios, expressed in base currency. Includes a per-portfolio breakdown. (`backend/src/routes/groups.ts`)
  - **`GroupForm` base currency selector** — Group create/edit modal now includes a base currency dropdown (defaults to AUD). (`frontend/src/components/forms/GroupForm.tsx`)
  - **`useGroupReports` hooks** — `useGroupSummary`, `useGroupPerformance`, `useGroupCapitalGains`, `useGroupTax`. (`frontend/src/hooks/useGroupReports.ts`)
  - **Group Dashboard** (`/groups/:id`) — Consolidated stat cards, performance chart with date range picker, and portfolio breakdown table with FX rates and per-portfolio contributions. (`frontend/src/pages/groups/GroupDashboardPage.tsx`)
  - **Group Capital Gains** (`/groups/:id/capital-gains`) — Combined CGT table with portfolio labels, summary stat cards, FY type/year selector. (`frontend/src/pages/groups/GroupCapitalGainsPage.tsx`)
  - **Group Tax Report** (`/groups/:id/tax`) — Consolidated tax waterfall plus per-portfolio breakdown cards. FY type/year selector. (`frontend/src/pages/groups/GroupTaxPage.tsx`)
  - **PortfoliosPage group header** — Each group section now has a "Dashboard" quick-link that navigates to `/groups/:id`. (`frontend/src/pages/PortfoliosPage.tsx`)

## [v0.3.4] — 2026-05-30

### Added

- **Portfolio Groups** — Users can create named groups (e.g. "Moomoo") and bundle multiple portfolios into them (e.g. "Moomoo AUD" + "Moomoo US"). Groups enable consolidated performance and tax reporting across related accounts.

  - **DB migration `006_folio_groups.sql`** — New `folio.portfolio_groups` table; nullable `group_id` FK on `folio.portfolios` (ON DELETE SET NULL so deleting a group un-groups its portfolios without touching trade data); full RLS.
  - **`GET/POST/PATCH/DELETE /api/groups`** — Full group CRUD; `GET` nests the group's portfolios in the response. (`backend/src/routes/groups.ts`)
  - **Portfolio PATCH route** — `PATCH /api/portfolios/:id` added (frontend uses PATCH; only PUT existed before). `group_id` added to portfolio schema. (`backend/src/routes/portfolios.ts`)
  - **`useGroups` hook** — `useGroups`, `useCreateGroup`, `useUpdateGroup`, `useDeleteGroup`, `useAssignPortfolioToGroup`. (`frontend/src/hooks/useGroups.ts`)
  - **`GroupForm` modal** — Create / edit a group (name + description). (`frontend/src/components/forms/GroupForm.tsx`)
  - **`PortfolioForm` group selector** — Optional "Group" select field appears when the user has at least one group. (`frontend/src/components/forms/PortfolioForm.tsx`)
  - **`PortfolioSelector` grouped dropdown** — Topnav portfolio picker now shows section headers per group and an "Ungrouped" section below. Flat view when no groups exist. (`frontend/src/components/layout/PortfolioSelector.tsx`)
  - **`PortfoliosPage` grouped layout** — Groups render as labelled sections with Edit/Delete buttons; portfolios appear as cards inside. Ungrouped portfolios shown at the bottom. "New Group" button in header. (`frontend/src/pages/PortfoliosPage.tsx`)

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
