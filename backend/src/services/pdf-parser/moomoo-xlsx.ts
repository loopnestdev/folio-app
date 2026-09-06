import * as XLSX from 'xlsx';
import type { ParsedTrade, TradeType } from '../../types';

// ── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Normalise various date shapes that come out of XLSX cells:
 *  - JS Date  (when cellDates: true)
 *  - "DD/MM/YYYY" strings (Moomoo AU format)
 *  - "YYYY/MM/DD" strings
 *  - Excel serial numbers (fallback)
 */
function parseDate(raw: unknown): string {
  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0];
  }
  if (typeof raw === 'string') {
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split('/');
      return `${y}-${m}-${d}`;
    }
    // YYYY/MM/DD or YYYY-MM-DD
    if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(raw)) {
      return raw.replace(/\//g, '-');
    }
    return raw;
  }
  if (typeof raw === 'number') {
    // Excel serial → JS date
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(raw);
}

/**
 * Map Moomoo "Market" column → exchange code used in the rest of the app.
 * Must match what the PDF parser produces so (symbol, exchange) upserts
 * don't create duplicate security records.
 *  AU / ASX → ASX  (matches PDF "ASX AUD" line; older files use "AU", newer use "ASX")
 *  US       → US   (matches PDF "US USD" line — NOT "NYSE", which would diverge)
 *  HK       → HK   (matches PDF "HK HKD" line)
 */
function mapMarket(market: string): string {
  switch (market.toUpperCase()) {
    case 'AU':
    case 'ASX': return 'ASX';
    case 'US':  return 'US';
    case 'HK':  return 'HK';
    default:    return market.toUpperCase();
  }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(/,/g, '')) || 0;
}

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v).trim() : fallback;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Moomoo AU "Financial Year Summary" .xlsx file.
 *
 * Sheets read:
 *  - Transaction Overview   → buy / sell trades
 *  - Estimated Dividend Overview → dividend trades
 *  - Interest Overview      → interest trades
 *
 * Returns trades sorted ascending by date, ready for the same forex-enrichment
 * step used by the PDF parser.
 */
export function parseMoomooAnnualSummary(buffer: Buffer): ParsedTrade[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const trades: ParsedTrade[] = [];

  // ── 1. Transaction Overview ───────────────────────────────────────────────
  const txSheet = wb.Sheets['Transaction Overview'];
  if (txSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(txSheet, { defval: null });
    for (const row of rows) {
      const direction = str(row['Direction']).toLowerCase();
      let tradeType: TradeType;
      if      (direction === 'buy')  tradeType = 'buy';
      else if (direction === 'sell') tradeType = 'sell';
      else continue;

      const dateVal = row['Transaction Date'];
      if (!dateVal) continue;

      const symbol = str(row['Security Code']).toUpperCase();
      if (!symbol) continue;

      const quantity = num(row['Quantity']);
      const price    = num(row['Avg Price']);
      const amount   = num(row['Transaction Amount']);

      // Moomoo renamed the column: newer files use "Transaction Fee(Inc.GST)",
      // older files had "Bokerage(Inc.GST)" (with a typo) or "Brokerage(Inc.GST)".
      const brokerageIncGST = num(
        row['Transaction Fee(Inc.GST)'] ??
        row['Bokerage(Inc.GST)']        ??
        row['Brokerage(Inc.GST)']       ??
        0,
      );
      const gst             = num(row['GST']);
      // Our DB stores brokerage and GST separately; the XLSX column already
      // includes GST inside the brokerage figure, so subtract it back out.
      const brokerage = Math.max(0, brokerageIncGST - gst);

      const market   = str(row['Market'], 'AU');
      const currency = str(row['Currency'], 'AUD').toUpperCase();
      const comment  = str(row['Comment']);

      trades.push({
        trade_date:    parseDate(dateVal),
        trade_type:    tradeType,
        symbol,
        security_name: str(row['Security Name'], symbol),
        exchange:      mapMarket(market),
        currency,
        quantity,
        price,
        amount,
        brokerage,
        gst,
        exchange_rate: 1,
        notes: comment || undefined,
      });
    }
  }

  // ── 2. Estimated Dividend Overview ────────────────────────────────────────
  const divSheet = wb.Sheets['Estimated Dividend Overview'];
  if (divSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(divSheet, { defval: null });
    for (const row of rows) {
      const payDate = row['Payment Date'];
      if (!payDate) continue;

      const symbol = str(row['Security Code']).toUpperCase();
      if (!symbol) continue;

      // Gross dividend = Unfranked + Franked amount — NOT "Net Amount". Two
      // reasons:
      //   1. CHESS-sponsored AU dividends (paid via share registry, not
      //      through the Moomoo cash account) report Net Amount as "/",
      //      which would otherwise drop the dividend entirely.
      //   2. Foreign (US) dividends are grossed up for AU tax purposes —
      //      withholding tax is a separate foreign-income-tax-offset claim,
      //      not a reduction of assessable dividend income. Using Net
      //      Amount understates taxable income by the withheld tax.
      // A row with zero unfranked+franked is a withholding-tax reversal /
      // adjustment line (e.g. Moomoo correcting an earlier WHT posting) —
      // it carries no new dividend income, so skip it.
      const unfranked = num(row['Unfranked Amount']);
      const franked   = num(row['Franked Amount']);
      const grossAmount = unfranked + franked;
      if (grossAmount <= 0) continue;

      const shares          = num(row['Participating Shares']);
      const dividendPerUnit = num(row['Cash Dividend/Unit']);
      const currency        = str(row['Currency'], 'AUD').toUpperCase();
      const market          = str(row['Market'], 'AU');

      trades.push({
        trade_date:    parseDate(payDate),
        trade_type:    'dividend',
        symbol,
        security_name: str(row['Security Name'], symbol),
        exchange:      mapMarket(market),
        currency,
        quantity:      shares || 1,
        price:         dividendPerUnit || grossAmount,
        amount:        grossAmount,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        notes: [
          `Unfranked: ${unfranked}`,
          `Franked: ${franked}`,
          `Withholding Tax: ${num(row['Withholding Tax'])}`,
          `Franking Credit: ${num(row['Franking Credit'])}`,
        ].join(', '),
      });
    }
  }

  // ── 3. Interest Overview ──────────────────────────────────────────────────
  const intSheet = wb.Sheets['Interest Overview'];
  if (intSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(intSheet, { defval: null });
    for (const row of rows) {
      const payDate = row['Payment Date'];
      if (!payDate) continue;

      const netAmount = num(row['Net Amount']);
      if (netAmount <= 0) continue;

      const currency = str(row['Currency'], 'AUD').toUpperCase();

      trades.push({
        trade_date:    parseDate(payDate),
        trade_type:    'interest',
        symbol:        'CASH',
        security_name: 'Cash Interest',
        exchange:      'ASX',
        currency,
        quantity:      1,
        price:         netAmount,
        amount:        netAmount,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        notes: `Total: ${num(row['Total Payment'])}, Withholding Tax: ${num(row['Withholding Tax'])}`,
      });
    }
  }

  // ── 4. Cash Overview ─────────────────────────────────────────────────────
  // Contains: bank deposits (ZEPTO_PR.*), AUD↔USD internal transfers, and
  // Moomoo cash vouchers.  "Stock Cash Coupon" entries are skipped here
  // because they are already captured as dividend/interest transactions via
  // monthly PDF imports (importing them again as deposits would double-count
  // the cash balance). Dividend / withholding-tax lines (e.g. "FANG CASH
  // DIVIDEND", "BITU ... SHARES WITHHOLDING TAX ...") are skipped for the
  // same reason — they duplicate rows already produced from the Estimated
  // Dividend Overview sheet above; importing both would double-count income.
  const cashSheet = wb.Sheets['Cash Overview'];
  if (cashSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cashSheet, { defval: null });
    for (const row of rows) {
      const payDate = row['Date'];
      if (!payDate) continue;

      const comment = str(row['Comment']);
      const amount  = num(row['Amount']);
      const currency = str(row['Currency'], 'AUD').toUpperCase();

      // Skip Moomoo Stock Cash Coupons — they are captured as dividend/interest
      // trades via PDF imports; importing them here would double-count cash.
      if (comment.toLowerCase().includes('stock cash coupon')) continue;
      // Skip dividend / withholding-tax cash lines — already captured above.
      if (/dividend|withholding tax/i.test(comment)) continue;

      if (amount === 0) continue;

      // "TRANSFER TO/FROM UNIVERSAL SECURITIES ACCOUNT (USD -> AUD 0.71...)" is an
      // internal conversion between this account's own currency sleeves, not new
      // external capital — must not be a deposit/withdrawal (see moomoo.ts's
      // Currency Exchange handling for the monthly-PDF equivalent of this same line).
      const isFxTransfer = /UNIVERSAL SECURITIES ACCOUNT|\([A-Z]+\s*->\s*[A-Z]+\s+[\d.]+\)/i.test(comment);
      const tradeType: TradeType = isFxTransfer
        ? (amount > 0 ? 'fx_transfer_in' : 'fx_transfer_out')
        : (amount > 0 ? 'deposit' : 'withdrawal');
      const absAmount = Math.abs(amount);

      trades.push({
        trade_date:    parseDate(payDate),
        trade_type:    tradeType,
        symbol:        'CASH',
        security_name: comment || (amount > 0 ? 'Cash Deposit' : 'Cash Withdrawal'),
        exchange:      currency === 'AUD' ? 'ASX' : 'US',
        currency,
        quantity:      1,
        price:         absAmount,
        amount:        absAmount,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        notes:         comment || undefined,
      });
    }
  }

  // Sort by date ascending so the preview table reads chronologically
  trades.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  return trades;
}
