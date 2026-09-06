import { extractTrades, parseTradesSection, parseCashSection, parseMovementSection } from '../src/services/pdf-parser/moomoo';

const SAMPLE_TRADES_SECTION = `Trades - Securities
Direction Symbol Exchange Currency Date/Time Price Quantity Amount
Buy to Open
NEBIUS
NBIS
US USD
2025/07/12
05:52:12
43.9700 21 923.37
Subtotal: 1.05 Number of Transactions: 1 Transaction Amount: 923.37 Net Transaction Amount: -924.42 Platform Fee: 0.99 Settlement Fee: 0.06 Consolidated Audit Trail Fees: 0.00
Sell to Close
Tesla
TSLA
US USD
2025/07/17
00:31:04
319.1500 15 4,787.25
Subtotal: 1.05 Number of Transactions: 1 Transaction Amount: 4,787.25 Net Transaction Amount: 4,786.20 Platform Fee: 0.99 Settlement Fee: 0.05 Trading Activity Fee: 0.01 Consolidated Audit Trail Fees: 0.00
Buy to Open Monochrome Bitcoin ETF
IBTC
ASX AUD
2025/07/24
15:07:57
17.7100 125 2,213.75
Subtotal: 3.00 Number of Transactions: 1 Transaction Amount: 2,213.75 Net Transaction Amount: -2,216.75 Commission: 0.91 Platform Fee: 1.82 GST: 0.27
Sell to Close
VanEck Bitcoin ETF
VBTC
ASX AUD
2025/07/02
11:29:18
32.5800 133 4,333.14
Subtotal: 3.00 Number of Transactions: 1 Transaction Amount: 4,333.14 Net Transaction Amount: 4,330.14 Commission: 0.91 Platform Fee: 1.82 GST: 0.27`;

const SAMPLE_MOVEMENT_SECTION = `Movement - Securities
Date/Time Type Exchange Symbol Currency Direction Quantity Comment
2025/07/27
14:41:32 Other ASX GDX
GDX AUD In +3 GDX DRIP
2025/08/01
09:15:00 Other US NVDA
NVDA USD In +1 Gift Share`;

const SAMPLE_CASH_SECTION = `Changes in Cash
AUD Date/Time Type Amount Comment
2025/07/17 18:43:59 Asset Adjustment +8.98 FANG CASH DIVIDEND
2025/07/25 18:30:14 Coupon +10.00 Stock Cash Coupon
USD Date/Time Type Amount Comment
2025/07/13 10:30:17 Coupon +7.31 Stock Cash Coupon
2025/07/23 18:30:06 Coupon +7.31 Stock Cash Coupon`;

describe('Moomoo PDF Parser', () => {
  describe('parseTradesSection', () => {
    it('parses USD buy trade correctly', () => {
      const trades = parseTradesSection(SAMPLE_TRADES_SECTION);
      const nbis = trades.find((t) => t.symbol === 'NBIS');
      expect(nbis).toBeDefined();
      expect(nbis?.trade_type).toBe('buy');
      expect(nbis?.quantity).toBe(21);
      expect(nbis?.price).toBe(43.97);
      expect(nbis?.amount).toBe(923.37);
      expect(nbis?.currency).toBe('USD');
      expect(nbis?.exchange).toBe('US');
      expect(nbis?.trade_date).toBe('2025-07-12');
    });

    it('parses USD sell trade correctly', () => {
      const trades = parseTradesSection(SAMPLE_TRADES_SECTION);
      const tsla = trades.find((t) => t.symbol === 'TSLA');
      expect(tsla).toBeDefined();
      expect(tsla?.trade_type).toBe('sell');
      expect(tsla?.quantity).toBe(15);
      expect(tsla?.price).toBe(319.15);
      expect(tsla?.amount).toBe(4787.25);
      expect(tsla?.trade_date).toBe('2025-07-17');
    });

    it('parses AUD buy trade with inline security name', () => {
      const trades = parseTradesSection(SAMPLE_TRADES_SECTION);
      const ibtc = trades.find((t) => t.symbol === 'IBTC');
      expect(ibtc).toBeDefined();
      expect(ibtc?.trade_type).toBe('buy');
      expect(ibtc?.currency).toBe('AUD');
      expect(ibtc?.exchange).toBe('ASX');
      expect(ibtc?.quantity).toBe(125);
      expect(ibtc?.price).toBe(17.71);
      expect(ibtc?.gst).toBe(0.27);
    });

    it('parses AUD sell trade with GST', () => {
      const trades = parseTradesSection(SAMPLE_TRADES_SECTION);
      const vbtc = trades.find((t) => t.symbol === 'VBTC');
      expect(vbtc).toBeDefined();
      expect(vbtc?.trade_type).toBe('sell');
      expect(vbtc?.currency).toBe('AUD');
      expect(vbtc?.brokerage).toBe(3.0);
      expect(vbtc?.gst).toBe(0.27);
    });

    it('returns empty array for empty section', () => {
      expect(parseTradesSection('')).toEqual([]);
    });
  });

  describe('parseMovementSection', () => {
    it('classifies a DRIP comment as drp, not buy', () => {
      const items = parseMovementSection(SAMPLE_MOVEMENT_SECTION);
      const gdx = items.find((t) => t.symbol === 'GDX');
      expect(gdx).toBeDefined();
      expect(gdx?.trade_type).toBe('drp');
      expect(gdx?.quantity).toBe(3);
      expect(gdx?.price).toBe(0);
      expect(gdx?.notes).toMatch(/DRIP reinvestment/);
    });

    it('still classifies a Gift Share as buy', () => {
      const items = parseMovementSection(SAMPLE_MOVEMENT_SECTION);
      const nvda = items.find((t) => t.symbol === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.trade_type).toBe('buy');
      expect(nvda?.notes).toBe('Gift Share from Moomoo');
    });
  });

  describe('parseCashSection', () => {
    it('extracts AUD dividend', () => {
      const items = parseCashSection(SAMPLE_CASH_SECTION);
      const dividend = items.find((t) => t.trade_type === 'dividend');
      expect(dividend).toBeDefined();
      expect(dividend?.symbol).toBe('FANG');
      expect(dividend?.amount).toBe(8.98);
      expect(dividend?.trade_date).toBe('2025-07-17');
    });

    it('extracts coupon payment as other_income (not interest)', () => {
      // Moomoo "Stock Cash Coupon" is a referral/incentive reward, not interest
      // paid on a cash balance — Moomoo's own annual tax summary never reports
      // it under Interest, so it's modeled as its own income category.
      const items = parseCashSection(SAMPLE_CASH_SECTION);
      const coupons = items.filter((t) => t.trade_type === 'other_income');
      expect(coupons.length).toBeGreaterThanOrEqual(1);
      expect(coupons[0]?.amount).toBe(10.0);
    });

    it('ignores negative amounts', () => {
      const section = `Changes in Cash
2025/07/17 18:43:59 Asset Adjustment -5.00 SOME FEE`;
      const items = parseCashSection(section);
      expect(items).toHaveLength(0);
    });
  });

  describe('extractTrades (full text)', () => {
    it('extracts both trades and cash items from combined text', () => {
      const combined = SAMPLE_TRADES_SECTION + '\n' + SAMPLE_CASH_SECTION + '\nEnding Positions';
      const all = extractTrades(combined);
      const buys = all.filter((t) => t.trade_type === 'buy');
      const sells = all.filter((t) => t.trade_type === 'sell');
      const dividends = all.filter((t) => t.trade_type === 'dividend');
      expect(buys.length).toBeGreaterThanOrEqual(1);
      expect(sells.length).toBeGreaterThanOrEqual(1);
      expect(dividends.length).toBeGreaterThanOrEqual(1);
    });
  });
});
