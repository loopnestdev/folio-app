import type { Statistics } from '../../types';

// RBA cash rate ~4.35% annualized → monthly
const RF_MONTHLY = 0.0435 / 12;

/**
 * Compute statistics from monthly return arrays.
 *
 * `portfolioReturns`  — full portfolio monthly returns (used for CAGR, Sharpe,
 *                       Sortino, Max Drawdown, Std Dev, Winning Months).
 * `benchmarkReturns`  — ASX 200 monthly returns, DATE-ALIGNED with `portfolioReturns`
 *                       (same months, same order) for Beta computation.
 * `sp500Returns`      — S&P 500 monthly returns, DATE-ALIGNED with `portfolioReturns`
 *                       for Correlation computation.
 *
 * Call sites should date-align the benchmark arrays to the portfolio's months
 * using `alignReturnMaps` before passing them here.
 */
export function computeStatistics(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  sp500Returns: number[],
): Statistics {
  const n = portfolioReturns.length;
  if (n < 2) {
    return { total_return_annualized: 0, winning_months_pct: 0, max_drawdown: 0, std_dev_monthly: 0, sharpe_ratio: 0, sortino_ratio: 0, beta: 0, correlation_sp500: 0 };
  }

  const avg = mean(portfolioReturns);
  const stdDev = standardDeviation(portfolioReturns);

  // Annualized return (geometric)
  const cumReturn = portfolioReturns.reduce((prod, r) => prod * (1 + r), 1) - 1;
  const years = n / 12;
  const totalReturnAnnualized = Math.pow(1 + cumReturn, 1 / Math.max(years, 1 / 12)) - 1;

  // Winning months
  const winning = portfolioReturns.filter((r) => r > 0).length;
  const winningMonthsPct = (winning / n) * 100;

  // Max drawdown (monthly, based on cumulative wealth index) — always a positive
  // magnitude; displayed as negative in the UI (it represents a loss from peak).
  let peak = 1;
  let cumVal = 1;
  let maxDrawdown = 0;
  for (const r of portfolioReturns) {
    cumVal *= 1 + r;
    if (cumVal > peak) peak = cumVal;
    const dd = peak > 0 ? (peak - cumVal) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio (annualized)
  const excessReturns = portfolioReturns.map((r) => r - RF_MONTHLY);
  const avgExcess = mean(excessReturns);
  const sharpeRatio = stdDev > 0 ? (avgExcess / stdDev) * Math.sqrt(12) : 0;

  // Sortino ratio (downside deviation, denominator uses n so infrequent losses dilute it)
  const downsideSquares = portfolioReturns
    .filter((r) => r < RF_MONTHLY)
    .map((r) => Math.pow(r - RF_MONTHLY, 2));
  const downsideStd = downsideSquares.length > 0
    ? Math.sqrt(downsideSquares.reduce((s, v) => s + v, 0) / n)
    : 0;
  const sortinoRatio = downsideStd > 0 ? (avgExcess / downsideStd) * Math.sqrt(12) : 0;

  // Beta vs ASX 200 — use only the date-aligned pairs.
  // benchmarkReturns must have the same length and cover the same months as portfolioReturns.
  const nBeta = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const benchAligned = benchmarkReturns.slice(0, nBeta);
  const portAlignedBeta = portfolioReturns.slice(0, nBeta);
  const benchVar = variance(benchAligned);
  const cov = covariance(portAlignedBeta, benchAligned);
  const beta = benchVar > 0 ? cov / benchVar : 0;

  // Correlation vs S&P 500 — date-aligned pairs.
  const nCorr = Math.min(portfolioReturns.length, sp500Returns.length);
  const sp500Aligned = sp500Returns.slice(0, nCorr);
  const portAlignedCorr = portfolioReturns.slice(0, nCorr);
  const sp500Std = standardDeviation(sp500Aligned);
  const portStdCorr = standardDeviation(portAlignedCorr);
  const covSP500 = covariance(portAlignedCorr, sp500Aligned);
  const correlationSp500 = sp500Std > 0 && portStdCorr > 0 ? covSP500 / (portStdCorr * sp500Std) : 0;

  return {
    total_return_annualized: totalReturnAnnualized,
    winning_months_pct: winningMonthsPct,
    max_drawdown: maxDrawdown,
    std_dev_monthly: stdDev,
    sharpe_ratio: sharpeRatio,
    sortino_ratio: sortinoRatio,
    beta,
    correlation_sp500: correlationSp500,
  };
}

/**
 * Build a map of month-string → monthly return using the Modified Dietz method.
 *
 * Simple (end − start) / start is wrong when deposits or withdrawals occur in the
 * month — the NAV jump looks like a return. Modified Dietz strips out external cash
 * flows so the result reflects only investment performance:
 *
 *   R = (end − start − CF) / (start + CF × 0.5)
 *
 * The 0.5 weight assumes flows occur at the month midpoint (standard approximation).
 * When CF = 0 this reduces to the simple return.
 *
 * @param dailyValues  Chronological { date, value } NAV series
 * @param monthlyFlows YYYY-MM → net external flow in same currency as NAV
 *                     (positive = deposit, negative = withdrawal)
 */
export function computeMonthlyReturnMapModifiedDietz(
  dailyValues: { date: string; value: number }[],
  monthlyFlows: Record<string, number>,
): Record<string, number> {
  if (dailyValues.length < 2) return {};

  const lastOfMonth: Record<string, number> = {};
  for (const { date, value } of dailyValues) {
    lastOfMonth[date.slice(0, 7)] = value;
  }

  const months = Object.keys(lastOfMonth).sort();
  const result: Record<string, number> = {};
  for (let i = 1; i < months.length; i++) {
    const prev = lastOfMonth[months[i - 1]]!;
    const curr = lastOfMonth[months[i]]!;
    const cf   = monthlyFlows[months[i]] ?? 0;
    // Modified Dietz: starting value + half of net cash flows
    const denom = prev + cf * 0.5;
    if (denom > 0) result[months[i]] = (curr - prev - cf) / denom;
  }
  return result;
}

/** Build a map of month-string → monthly return from a daily value series. */
export function computeMonthlyReturnMap(
  dailyValues: { date: string; value: number }[]
): Record<string, number> {
  if (dailyValues.length < 2) return {};

  // Keep the LAST value seen per month
  const lastOfMonth: Record<string, number> = {};
  for (const { date, value } of dailyValues) {
    lastOfMonth[date.slice(0, 7)] = value;
  }

  const months = Object.keys(lastOfMonth).sort();
  const result: Record<string, number> = {};
  for (let i = 1; i < months.length; i++) {
    const prev = lastOfMonth[months[i - 1]]!;
    const curr = lastOfMonth[months[i]]!;
    if (prev > 0) result[months[i]] = (curr - prev) / prev;
  }
  return result;
}

/**
 * Given portfolio and benchmark monthly return maps (keyed by "YYYY-MM"),
 * return arrays covering only the months that appear in BOTH maps, in date order.
 * This ensures Beta / Correlation are computed on the same calendar periods.
 */
export function alignReturnMaps(
  portfolioMap: Record<string, number>,
  benchmarkMap: Record<string, number>,
): { portfolio: number[]; benchmark: number[] } {
  const commonMonths = Object.keys(portfolioMap)
    .filter((m) => m in benchmarkMap)
    .sort();
  return {
    portfolio: commonMonths.map((m) => portfolioMap[m]!),
    benchmark: commonMonths.map((m) => benchmarkMap[m]!),
  };
}

/** @deprecated Use computeMonthlyReturnMap for date-aligned statistics. */
export function computeMonthlyReturns(
  dailyValues: { date: string; value: number }[]
): number[] {
  if (dailyValues.length < 2) return [];

  const byMonth: Record<string, { first: number; last: number }> = {};
  for (const { date, value } of dailyValues) {
    const month = date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { first: value, last: value };
    byMonth[month].last = value;
  }

  const months = Object.keys(byMonth).sort();
  const returns: number[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = byMonth[months[i - 1]]!.last;
    const curr = byMonth[months[i]]!.last;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  const avg = mean(arr);
  return arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / Math.max(arr.length, 1);
}

function standardDeviation(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const avgA = mean(a.slice(0, n));
  const avgB = mean(b.slice(0, n));
  return a.slice(0, n).reduce((s, v, i) => s + (v - avgA) * ((b[i] ?? 0) - avgB), 0) / n;
}
