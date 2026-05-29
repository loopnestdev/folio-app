import type { Statistics } from '../../types';

// RBA cash rate ~4.35% annualized → monthly
const RF_MONTHLY = 0.0435 / 12;

export function computeStatistics(
  portfolioReturns: number[],
  benchmarkReturns: number[],
  sp500Returns: number[]
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

  // Max drawdown (monthly, based on cumulative wealth)
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

  // Sortino ratio (downside deviation)
  const downsideSquares = portfolioReturns
    .filter((r) => r < RF_MONTHLY)
    .map((r) => Math.pow(r - RF_MONTHLY, 2));
  const downsideStd = downsideSquares.length > 0
    ? Math.sqrt(downsideSquares.reduce((s, v) => s + v, 0) / n)
    : 0;
  const sortinoRatio = downsideStd > 0 ? (avgExcess / downsideStd) * Math.sqrt(12) : 0;

  // Beta vs ASX 200 benchmark
  const benchAvg = mean(benchmarkReturns);
  const benchVar = variance(benchmarkReturns);
  const cov = covariance(portfolioReturns, benchmarkReturns);
  const beta = benchVar > 0 ? cov / benchVar : 0;

  // Correlation vs S&P 500
  const sp500Avg = mean(sp500Returns);
  const sp500Std = standardDeviation(sp500Returns);
  const covSP500 = covariance(portfolioReturns, sp500Returns);
  const correlationSp500 = sp500Std > 0 && stdDev > 0 ? covSP500 / (stdDev * sp500Std) : 0;

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

export function computeMonthlyReturns(
  dailyValues: { date: string; value: number }[]
): number[] {
  if (dailyValues.length < 2) return [];

  const byMonth: Record<string, { first: number; last: number }> = {};
  for (const { date, value } of dailyValues) {
    const month = date.slice(0, 7); // "YYYY-MM"
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
