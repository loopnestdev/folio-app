import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { calculateCapitalGains } from '../calculations/holdings';
import { getForexRate } from '../market-data/yahoo';
import type { Trade } from '../../types';

export interface GroupPortfolioTax {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_currency: string;
  fx_rate: number;
  dividends_received: number;
  interest_received: number;
  other_income_received: number;
  capital_gains_short_term: number;
  capital_gains_long_term: number;
  cgt_discount_applied: number;
  total_taxable_income: number;
}

export interface GroupTaxTradeRow {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_currency: string;
  trade_date: string;
  trade_type: string;
  symbol: string;
  security_name: string | null;
  quantity: number;
  price: number;
  brokerage: number;
  amount_native: number;
  fx_rate: number;
  amount_base: number;
}

export interface GroupTaxCgtLotRow {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_currency: string;
  symbol: string;
  security_name: string;
  buy_date: string;
  sell_date: string;
  hold_days: number;
  quantity: number;
  cost_base: number;
  proceeds: number;
  gross_gain: number;
  cgt_discount_eligible: boolean;
  cgt_discount_amount: number;
  net_gain: number;
  fx_rate: number;
  cost_base_base: number;
  proceeds_base: number;
  gross_gain_base: number;
  net_gain_base: number;
}

export interface GroupTaxData {
  financial_year: string;
  base_currency: string;
  fy_start_date: string;
  fy_end_date: string;
  dividends_received: number;
  interest_received: number;
  other_income_received: number;
  capital_gains_short_term: number;
  capital_gains_long_term: number;
  cgt_discount_applied: number;
  total_taxable_income: number;
  portfolios: GroupPortfolioTax[];
  trades: GroupTaxTradeRow[];
  cgt_lots: GroupTaxCgtLotRow[];
}

async function getGroup(groupId: string, userId: string) {
  const { data } = await supabase
    .from('portfolio_groups')
    .select('*')
    .eq('id', groupId)
    .eq('user_id', userId)
    .single();
  return data;
}

async function getGroupPortfolios(groupId: string, userId: string) {
  const { data } = await supabase
    .from('portfolios')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId);
  return data ?? [];
}

async function getPortfolioTrades(portfolioId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*, security:securities(*)')
    .eq('portfolio_id', portfolioId)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Trade[];
}

// Cash-flow sign convention — matches runningCash in reports.ts / groups.ts:
// buy/drp reduce cash, sell/dividend/interest/deposit increase it, withdrawal reduces it.
const CASH_FLOW_SIGN: Record<string, 1 | -1> = {
  sell: 1, dividend: 1, interest: 1, other_income: 1, deposit: 1,
  buy: -1, drp: -1, withdrawal: -1,
};

/**
 * Builds the full consolidated tax picture for a portfolio group: the same
 * summary numbers shown on GroupTaxPage, plus a per-trade FY ledger and a
 * flattened CGT lot list — both converted to the group's base currency at
 * each transaction's OWN trade date. Used by both GET /api/groups/:id/tax
 * (which returns only the summary subset) and the tax export endpoint.
 */
export async function buildGroupTaxData(
  groupId: string,
  userId: string,
  fyStart: 'january' | 'july',
  year: number,
): Promise<GroupTaxData | null> {
  const group = await getGroup(groupId, userId);
  if (!group) return null;

  const baseCurrency: string = group.base_currency ?? 'AUD';
  const fyStartDate = fyStart === 'july' ? `${year - 1}-07-01` : `${year}-01-01`;
  const fyEndDate   = fyStart === 'july' ? `${year}-06-30`     : `${year}-12-31`;
  const fyLabel     = fyStart === 'july' ? `${year - 1}–${year}` : String(year);

  const portfolios = await getGroupPortfolios(groupId, userId);
  if (!portfolios.length) {
    return {
      financial_year: fyLabel, base_currency: baseCurrency, fy_start_date: fyStartDate, fy_end_date: fyEndDate,
      dividends_received: 0, interest_received: 0, other_income_received: 0,
      capital_gains_short_term: 0, capital_gains_long_term: 0,
      cgt_discount_applied: 0, total_taxable_income: 0, portfolios: [], trades: [], cgt_lots: [],
    };
  }

  const portfolioData = await Promise.all(
    portfolios.map(async (portfolio) => {
      const trades = await getPortfolioTrades(portfolio.id);
      const lots   = calculateCapitalGains(trades as any, fyStart, year);
      return { portfolio, trades, lots };
    }),
  );

  // Collect every (currency, date) pair that needs an FX lookup:
  //   • today's rate — shown as an informational fx_rate on the per-portfolio
  //     breakdown only; income is NOT converted at this rate (see below)
  //   • each CGT lot's sell_date — ATO disposal-date rate
  //   • each FY trade's own trade_date — dividends/interest/other-income are
  //     converted at their own payment-date rate (same treatment as CGT),
  //     so the Tax Summary always agrees with the Trade Ledger export for
  //     the same income instead of using one flat "today" rate for everything
  const today = format(new Date(), 'yyyy-MM-dd');
  const fxPairSet = new Set<string>();
  for (const { portfolio, trades, lots } of portfolioData) {
    if (portfolio.currency === baseCurrency) continue;
    fxPairSet.add(`${portfolio.currency}|${today}`);
    for (const lot of lots) fxPairSet.add(`${portfolio.currency}|${lot.sell_date}`);
    for (const t of trades) {
      if (t.trade_date >= fyStartDate && t.trade_date <= fyEndDate) {
        fxPairSet.add(`${portfolio.currency}|${t.trade_date}`);
      }
    }
  }

  const fxCache = new Map<string, number>();
  await Promise.all(
    [...fxPairSet].map(async (key) => {
      const [cur, date] = key.split('|');
      fxCache.set(key, await getForexRate(cur, baseCurrency, date));
    }),
  );
  const getFx = (currency: string, date: string): number =>
    currency === baseCurrency ? 1 : (fxCache.get(`${currency}|${date}`) ?? 1);

  // Per-portfolio summary.
  const portfolioTaxData: GroupPortfolioTax[] = portfolioData.map(({ portfolio, trades, lots }) => {
    const fxToday = getFx(portfolio.currency, today); // display-only, shown on the breakdown card
    const fyTrades = trades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);

    const dividends   = fyTrades.filter(t => t.trade_type === 'dividend');
    const interest    = fyTrades.filter(t => t.trade_type === 'interest');
    const otherIncome = fyTrades.filter(t => t.trade_type === 'other_income');
    // Each payment converted at ITS OWN date's rate — same treatment as CGT's
    // disposal-date rate — so this total always matches the Trade Ledger export.
    const dividendIncome   = dividends.reduce((s, t) => s + (t.price * t.quantity) * getFx(portfolio.currency, t.trade_date), 0);
    const interestIncome   = interest.reduce( (s, t) => s + (t.price * t.quantity) * getFx(portfolio.currency, t.trade_date), 0);
    const otherIncomeTotal = otherIncome.reduce((s, t) => s + (t.price * t.quantity) * getFx(portfolio.currency, t.trade_date), 0);

    const shortTerm = lots.filter(l => l.hold_days < 365)
      .reduce((s, l) => s + l.net_gain * getFx(portfolio.currency, l.sell_date), 0);
    const longTerm  = lots.filter(l => l.hold_days >= 365)
      .reduce((s, l) => s + l.net_gain * getFx(portfolio.currency, l.sell_date), 0);
    const discount  = lots.filter(l => l.cgt_discount_eligible)
      .reduce((s, l) => s + l.cgt_discount_amount * getFx(portfolio.currency, l.sell_date), 0);

    return {
      portfolio_id: portfolio.id,
      portfolio_name: portfolio.name,
      portfolio_currency: portfolio.currency,
      fx_rate: fxToday,
      dividends_received: dividendIncome,
      interest_received: interestIncome,
      other_income_received: otherIncomeTotal,
      capital_gains_short_term: shortTerm,
      capital_gains_long_term: longTerm,
      cgt_discount_applied: discount,
      total_taxable_income: dividendIncome + interestIncome + otherIncomeTotal + shortTerm + longTerm - discount,
    };
  });

  const sum = (key: keyof GroupPortfolioTax) =>
    portfolioTaxData.reduce((s, p) => s + (p[key] as number), 0);

  // Full FY trade ledger across all group portfolios, each row converted at its own trade date.
  const trades: GroupTaxTradeRow[] = [];
  for (const { portfolio, trades: portfolioTrades } of portfolioData) {
    const fyTrades = portfolioTrades.filter(t => t.trade_date >= fyStartDate && t.trade_date <= fyEndDate);
    for (const t of fyTrades) {
      const qty       = Number(t.quantity)   || 0;
      const price     = Number(t.price)      || 0;
      const brokerage = Number(t.brokerage)  || 0;
      const amountNative =
        t.trade_type === 'buy' || t.trade_type === 'drp' ? -(qty * price + brokerage) :
        t.trade_type === 'sell'                           ? (qty * price - brokerage) :
        (CASH_FLOW_SIGN[t.trade_type] ?? 1) * qty * price;
      const fx = getFx(portfolio.currency, t.trade_date);

      trades.push({
        portfolio_id:       portfolio.id,
        portfolio_name:     portfolio.name,
        portfolio_currency: portfolio.currency,
        trade_date:         t.trade_date,
        trade_type:         t.trade_type,
        symbol:             t.security?.symbol ?? '',
        security_name:      t.security?.name ?? null,
        quantity:           qty,
        price,
        brokerage,
        amount_native:      amountNative,
        fx_rate:            fx,
        amount_base:        amountNative * fx,
      });
    }
  }
  trades.sort((a, b) => a.trade_date.localeCompare(b.trade_date) || a.symbol.localeCompare(b.symbol));

  // Flattened CGT lot detail (disposal-date FX, matching /api/groups/:id/capital-gains).
  const cgtLots: GroupTaxCgtLotRow[] = [];
  for (const { portfolio, lots } of portfolioData) {
    for (const l of lots) {
      const fx = getFx(portfolio.currency, l.sell_date);
      cgtLots.push({
        portfolio_id:       portfolio.id,
        portfolio_name:     portfolio.name,
        portfolio_currency: portfolio.currency,
        symbol:             l.symbol,
        security_name:      l.security_name,
        buy_date:           l.buy_date,
        sell_date:          l.sell_date,
        hold_days:          l.hold_days,
        quantity:           l.quantity,
        cost_base:          l.cost_base,
        proceeds:           l.proceeds,
        gross_gain:         l.gross_gain,
        cgt_discount_eligible: l.cgt_discount_eligible,
        cgt_discount_amount:   l.cgt_discount_amount,
        net_gain:           l.net_gain,
        fx_rate:            fx,
        cost_base_base:     l.cost_base  * fx,
        proceeds_base:      l.proceeds   * fx,
        gross_gain_base:    l.gross_gain * fx,
        net_gain_base:      l.net_gain   * fx,
      });
    }
  }
  cgtLots.sort((a, b) => a.sell_date.localeCompare(b.sell_date));

  return {
    financial_year: fyLabel,
    base_currency: baseCurrency,
    fy_start_date: fyStartDate,
    fy_end_date: fyEndDate,
    dividends_received:       sum('dividends_received'),
    interest_received:        sum('interest_received'),
    other_income_received:    sum('other_income_received'),
    capital_gains_short_term: sum('capital_gains_short_term'),
    capital_gains_long_term:  sum('capital_gains_long_term'),
    cgt_discount_applied:     sum('cgt_discount_applied'),
    total_taxable_income:     sum('total_taxable_income'),
    portfolios: portfolioTaxData,
    trades,
    cgt_lots: cgtLots,
  };
}
