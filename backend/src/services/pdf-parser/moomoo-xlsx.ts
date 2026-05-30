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

/** Map Moomoo "Market" column → exchange code used in the rest of the app. */
function mapMarket(market: string): string {
  switch (market.toUpperCase()) {
    case 'AU':  return 'ASX';
    case 'US':  return 'NYSE';
    case 'HK':  return 'HKEX';
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

      // Moomoo has a typo in their column name: "Bokerage(Inc.GST)"
      const brokerageIncGST = num(row['Bokerage(Inc.GST)'] ?? row['Brokerage(Inc.GST)'] ?? 0);
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

      const netAmount = num(row['Net Amount']);
      if (netAmount <= 0) continue;

      const shares         = num(row['Participating Shares']);
      const dividendPerUnit = num(row['Cash Dividend/Unit']);
      const currency       = str(row['Currency'], 'AUD').toUpperCase();
      const market         = str(row['Market'], 'AU');

      trades.push({
        trade_date:    parseDate(payDate),
        trade_type:    'dividend',
        symbol,
        security_name: str(row['Security Name'], symbol),
        exchange:      mapMarket(market),
        currency,
        quantity:      shares || 1,
        price:         dividendPerUnit || netAmount,
        amount:        netAmount,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        notes: [
          `Unfranked: ${num(row['Unfranked Amount'])}`,
          `Franked: ${num(row['Franked Amount'])}`,
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

  // Sort by date ascending so the preview table reads chronologically
  trades.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  return trades;
}
