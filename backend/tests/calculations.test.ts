import { calculateHoldings, calculateCapitalGains } from '../src/services/calculations/holdings';
import { computeStatistics, computeMonthlyReturns } from '../src/services/calculations/statistics';
import type { Trade } from '../src/types';

function makeTrade(overrides: Partial<Trade> & { symbol: string }): Trade {
  return {
    id: Math.random().toString(),
    portfolio_id: 'p1',
    security_id: 's1',
    trade_date: '2024-01-01',
    trade_type: 'buy',
    quantity: 100,
    price: 10,
    brokerage: 0,
    gst: 0,
    currency: 'AUD',
    exchange_rate: 1,
    notes: null,
    source: 'manual',
    created_at: '',
    updated_at: '',
    security: { id: 's1', symbol: overrides.symbol, name: overrides.symbol, exchange: 'ASX', currency: 'AUD', sector: null, industry: null, country: null, asset_type: null },
    ...overrides,
  } as Trade;
}

describe('Holdings Calculation (FIFO)', () => {
  it('calculates correct holding after buy', () => {
    const trades = [makeTrade({ symbol: 'CBA', quantity: 10, price: 100 })];
    const holdings = calculateHoldings(trades as any, { CBA: 120 });
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.quantity).toBe(10);
    expect(holdings[0]!.avg_cost).toBeCloseTo(100);
    expect(holdings[0]!.market_value).toBeCloseTo(1200);
    expect(holdings[0]!.unrealized_gain).toBeCloseTo(200);
  });

  it('reduces holding after partial sell', () => {
    const trades = [
      makeTrade({ symbol: 'CBA', trade_date: '2024-01-01', quantity: 10, price: 100, trade_type: 'buy' }),
      makeTrade({ symbol: 'CBA', trade_date: '2024-06-01', quantity: 4, price: 130, trade_type: 'sell' }),
    ];
    const holdings = calculateHoldings(trades as any, { CBA: 130 });
    expect(holdings[0]!.quantity).toBe(6);
  });

  it('removes holding after full sell', () => {
    const trades = [
      makeTrade({ symbol: 'CBA', trade_date: '2024-01-01', quantity: 10, price: 100, trade_type: 'buy' }),
      makeTrade({ symbol: 'CBA', trade_date: '2024-06-01', quantity: 10, price: 130, trade_type: 'sell' }),
    ];
    const holdings = calculateHoldings(trades as any, {});
    expect(holdings).toHaveLength(0);
  });

  it('handles brokerage in cost base', () => {
    const trades = [makeTrade({ symbol: 'BHP', quantity: 100, price: 40, brokerage: 10 })];
    const holdings = calculateHoldings(trades as any, { BHP: 40 });
    expect(holdings[0]!.avg_cost).toBeCloseTo(40.1);
    expect(holdings[0]!.cost_base).toBeCloseTo(4010);
  });

  it('handles multiple buys FIFO correctly', () => {
    const trades = [
      makeTrade({ symbol: 'WBC', trade_date: '2023-01-01', quantity: 5, price: 20, trade_type: 'buy' }),
      makeTrade({ symbol: 'WBC', trade_date: '2023-06-01', quantity: 5, price: 25, trade_type: 'buy' }),
    ];
    const holdings = calculateHoldings(trades as any, { WBC: 22 });
    expect(holdings[0]!.quantity).toBe(10);
    expect(holdings[0]!.cost_base).toBeCloseTo(225); // 5*20 + 5*25
  });
});

describe('Capital Gains (CGT)', () => {
  it('calculates short-term gain (no 50% discount)', () => {
    const trades = [
      makeTrade({ symbol: 'APT', trade_date: '2024-08-01', quantity: 100, price: 10, trade_type: 'buy' }),
      makeTrade({ symbol: 'APT', trade_date: '2025-01-15', quantity: 100, price: 15, trade_type: 'sell' }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.gross_gain).toBeCloseTo(500);
    expect(lots[0]!.cgt_discount_eligible).toBe(false);
    expect(lots[0]!.net_gain).toBeCloseTo(500);
  });

  it('applies 50% CGT discount for assets held > 12 months', () => {
    const trades = [
      makeTrade({ symbol: 'ANZ', trade_date: '2023-01-01', quantity: 100, price: 10, trade_type: 'buy' }),
      makeTrade({ symbol: 'ANZ', trade_date: '2025-01-15', quantity: 100, price: 20, trade_type: 'sell' }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.cgt_discount_eligible).toBe(true);
    expect(lots[0]!.cgt_discount_amount).toBeCloseTo(500);
    expect(lots[0]!.net_gain).toBeCloseTo(500);
  });

  it('no discount on losses even if held > 12 months', () => {
    const trades = [
      makeTrade({ symbol: 'XYZ', trade_date: '2023-01-01', quantity: 100, price: 20, trade_type: 'buy' }),
      makeTrade({ symbol: 'XYZ', trade_date: '2025-01-15', quantity: 100, price: 10, trade_type: 'sell' }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots[0]!.cgt_discount_eligible).toBe(false);
    expect(lots[0]!.net_gain).toBeCloseTo(-1000);
  });
});

describe('Capital Gains — forex (exchange_rate)', () => {
  it('uses AUD-equivalent cost base for USD buy', () => {
    // Buy 10 AAPL @ USD 100, exchange_rate 1.5 (1 USD = 1.5 AUD)
    // AUD cost base = 10 * 100 * 1.5 = 1500 AUD
    // Sell 10 AAPL @ USD 150, same rate → AUD proceeds = 10 * 150 * 1.5 = 2250 AUD
    // Gross gain = 750 AUD
    // Sell date 2024-11-01 is within FY2025 (Jul 2024–Jun 2025)
    const trades = [
      makeTrade({ symbol: 'AAPL', trade_date: '2024-01-01', quantity: 10, price: 100, trade_type: 'buy',  currency: 'USD', exchange_rate: 1.5 }),
      makeTrade({ symbol: 'AAPL', trade_date: '2024-11-01', quantity: 10, price: 150, trade_type: 'sell', currency: 'USD', exchange_rate: 1.5 }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.cost_base).toBeCloseTo(1500);   // 10 * 100 * 1.5
    expect(lots[0]!.proceeds).toBeCloseTo(2250);    // 10 * 150 * 1.5
    expect(lots[0]!.gross_gain).toBeCloseTo(750);
  });

  it('correctly handles different buy and sell exchange rates', () => {
    // Buy @ 1.5 AUD/USD, sell @ 1.6 AUD/USD — AUD depreciated (USD worth more)
    // ATO: cost base uses BUY rate; proceeds use SELL rate
    // Buy: 10 * 100 * 1.5 = 1500 AUD cost
    // Sell: 10 * 100 * 1.6 = 1600 AUD proceeds
    // Gain = 100 AUD even though USD price unchanged
    const trades = [
      makeTrade({ symbol: 'MSFT', trade_date: '2024-01-01', quantity: 10, price: 100, trade_type: 'buy',  currency: 'USD', exchange_rate: 1.5 }),
      makeTrade({ symbol: 'MSFT', trade_date: '2024-11-01', quantity: 10, price: 100, trade_type: 'sell', currency: 'USD', exchange_rate: 1.6 }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.cost_base).toBeCloseTo(1500);
    expect(lots[0]!.proceeds).toBeCloseTo(1600);
    expect(lots[0]!.gross_gain).toBeCloseTo(100);
  });

  it('AUD trades (exchange_rate=1) behave unchanged', () => {
    const trades = [
      makeTrade({ symbol: 'CBA', trade_date: '2024-01-01', quantity: 100, price: 100, trade_type: 'buy',  currency: 'AUD', exchange_rate: 1 }),
      makeTrade({ symbol: 'CBA', trade_date: '2025-01-15', quantity: 100, price: 120, trade_type: 'sell', currency: 'AUD', exchange_rate: 1 }),
    ];
    const lots = calculateCapitalGains(trades as any, 'july', 2025);
    expect(lots[0]!.cost_base).toBeCloseTo(10000);
    expect(lots[0]!.proceeds).toBeCloseTo(12000);
    expect(lots[0]!.gross_gain).toBeCloseTo(2000);
  });
});

describe('Statistics', () => {
  const monthlyReturns = [0.05, -0.02, 0.03, 0.04, -0.01, 0.06, 0.02, -0.03, 0.04, 0.01, 0.05, 0.03];
  const benchReturns = [0.04, -0.01, 0.02, 0.03, -0.02, 0.05, 0.01, -0.02, 0.03, 0.01, 0.04, 0.02];

  it('computes positive Sharpe ratio for profitable portfolio', () => {
    const stats = computeStatistics(monthlyReturns, benchReturns, benchReturns);
    expect(stats.sharpe_ratio).toBeGreaterThan(0);
  });

  it('computes max drawdown', () => {
    const stats = computeStatistics(monthlyReturns, benchReturns, benchReturns);
    expect(stats.max_drawdown).toBeGreaterThanOrEqual(0);
    expect(stats.max_drawdown).toBeLessThanOrEqual(1);
  });

  it('computes winning months percentage', () => {
    const stats = computeStatistics(monthlyReturns, benchReturns, benchReturns);
    const winningCount = monthlyReturns.filter(r => r > 0).length;
    expect(stats.winning_months_pct).toBeCloseTo((winningCount / monthlyReturns.length) * 100, 0);
  });

  it('computes standard deviation', () => {
    const stats = computeStatistics(monthlyReturns, benchReturns, benchReturns);
    expect(stats.std_dev_monthly).toBeGreaterThan(0);
  });

  it('handles empty array gracefully', () => {
    const stats = computeStatistics([], [], []);
    expect(stats.sharpe_ratio).toBe(0);
    expect(stats.max_drawdown).toBe(0);
  });

  it('computes monthly returns from daily values', () => {
    const daily = [
      { date: '2024-01-31', value: 10000 },
      { date: '2024-02-29', value: 10500 },
      { date: '2024-03-31', value: 10200 },
    ];
    const returns = computeMonthlyReturns(daily);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.05);
  });
});
