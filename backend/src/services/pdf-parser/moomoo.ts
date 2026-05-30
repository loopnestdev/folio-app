// pdf-parse v2 uses a class-based API: new PDFParse({ data: buffer }).getText()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> } };
import type { ParsedTrade, TradeType } from '../../types';

export async function parseMoomooStatement(pdfBuffer: Buffer): Promise<ParsedTrade[]> {
  const parser = new PDFParse({ data: pdfBuffer });
  let text: string;
  try {
    const result = await parser.getText();
    text = result.text;
  } finally {
    await parser.destroy();
  }
  return extractTrades(text);
}

export function extractTrades(text: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];

  const tradesSection = extractSection(text, 'Trades - Securities', 'Changes in Cash');
  if (tradesSection) {
    trades.push(...parseTradesSection(tradesSection));
  }

  const cashSection = extractSection(text, 'Changes in Cash', 'Ending Positions');
  if (cashSection) {
    trades.push(...parseCashSection(cashSection));
  }

  // Gift shares, DRP transfers, etc. live under "Movement - Securities"
  const movementSection = extractSection(text, 'Movement - Securities', 'Changes in Cash');
  if (movementSection) {
    trades.push(...parseMovementSection(movementSection));
  }

  return trades;
}

function extractSection(text: string, startMarker: string, endMarker: string): string | null {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return null;
  const endIdx = text.indexOf(endMarker, startIdx + startMarker.length);
  return text.slice(startIdx, endIdx === -1 ? undefined : endIdx);
}

function parseNumber(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function parseDate(dateStr: string): string {
  // "2025/07/12" → "2025-07-12"
  return dateStr.replace(/\//g, '-');
}

function parseFees(subtotalLine: string): { brokerage: number; gst: number } {
  const subtotalMatch = subtotalLine.match(/^Subtotal:\s*([\d,\.]+)/);
  const brokerage = subtotalMatch ? parseNumber(subtotalMatch[1]) : 0;
  const gstMatch = subtotalLine.match(/GST:\s*([\d,\.]+)/);
  const gst = gstMatch ? parseNumber(gstMatch[1]) : 0;
  return { brokerage, gst };
}

/**
 * Parse the "Trades - Securities" section.
 *
 * pdf-parse v2 renders PDF tables with tab-separated columns, so each
 * trade occupies three lines:
 *   Line 1: "Buy to Open\tBuy to Open \tSecurity Name"
 *   Line 2: "SYMBOL\tEXCHANGE\tCURRENCY\t2024/08/02"
 *   Line 3: "HH:MM:SS\tPRICE\tQTY\tAMOUNT"
 *   [optional] "Subtotal: N.NN\t...\tGST: N.NN\t..."
 *
 * Grouped trades (multiple fills sharing one subtotal) are handled by
 * skipping the subtotal lookup when the next line is another trade header.
 * Page-break content between a trade and its subtotal is also skipped.
 */
export function parseTradesSection(section: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);

  // Helper: first tab-separated token
  const firstToken = (s: string) => (s.split('\t')[0] ?? '').trim();
  const isTradeLine = (s: string) => {
    const t = firstToken(s);
    return t === 'Buy to Open' || t.startsWith('Buy to Open ') ||
           t === 'Sell to Close' || t.startsWith('Sell to Close ');
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const ft = firstToken(line);
    const isBuy  = ft === 'Buy to Open'  || ft.startsWith('Buy to Open ');
    const isSell = ft === 'Sell to Close' || ft.startsWith('Sell to Close ');

    if (!isBuy && !isSell) { i++; continue; }

    const tradeType: TradeType = isBuy ? 'buy' : 'sell';

    // Security name is the last non-empty tab token on the direction line
    // e.g. ["Buy to Open", "Buy to Open ", "Global X FANG+ ETF"]
    const dirParts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    const securityName = dirParts.length >= 3 ? dirParts[dirParts.length - 1] : '';

    // Line 2: SYMBOL \t EXCHANGE \t CURRENCY \t YYYY/MM/DD
    const line2 = lines[++i] ?? '';
    const p2 = line2.split('\t').map((s) => s.trim()).filter(Boolean);
    if (p2.length < 4) { i++; continue; }
    const [symbol, exchange, currency, dateStr] = p2;
    if (!symbol || !exchange || !currency || !/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) { i++; continue; }

    // Line 3: TIME \t PRICE \t QTY \t AMOUNT
    const line3 = lines[++i] ?? '';
    const p3 = line3.split('\t').map((s) => s.trim()).filter(Boolean);
    if (p3.length < 4) { i++; continue; }
    const price    = parseNumber(p3[1]);
    const quantity = parseNumber(p3[2]);
    const amount   = parseNumber(p3[3]);

    // Subtotal lookup:
    //  - When two fills share a subtotal (grouped), the next line is another
    //    trade header — don't scan ahead, use brokerage=0.
    //  - Otherwise scan up to 8 lines ahead (covers page-break content that
    //    pdf-parse inserts between the trade and its subtotal).
    let brokerage = 0;
    let gst = 0;

    if (!isTradeLine(lines[i + 1] ?? '')) {
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j];
        if (l.startsWith('Subtotal:')) {
          const fees = parseFees(l);
          brokerage = fees.brokerage;
          gst       = fees.gst;
          i = j; // advance i to subtotal; outer i++ will skip past it
          break;
        }
        if (isTradeLine(l)) break; // hit the next trade without finding a subtotal
      }
    }

    if (symbol && exchange && currency && quantity > 0) {
      trades.push({
        trade_date:    parseDate(dateStr),
        trade_type:    tradeType,
        symbol:        symbol.toUpperCase(),
        security_name: securityName || symbol.toUpperCase(),
        exchange,
        currency,
        quantity,
        price,
        amount,
        brokerage,
        gst,
      });
    }

    i++;
  }

  return trades;
}

/**
 * Parse the "Movement - Securities" section for gift shares and other
 * non-trade position changes (DRP transfers, broker promotions, etc.).
 *
 * Moomoo uses "Type: Other, Comment: Gift Share" for promotional free shares.
 * These never appear in "Trades - Securities" so the buy parser misses them.
 * We import them as trade_type='buy' at price $0 so the portfolio shows the
 * correct position. Multiple +1 entries for the same symbol on the same date
 * are aggregated into a single trade row.
 *
 * Other "Other" types (stock splits via movement, etc.) are ignored here —
 * only "Gift Share" in the comment is captured for now.
 */
export function parseMovementSection(section: string): ParsedTrade[] {
  // Normalize: tabs → spaces, collapse runs, split by line
  const lines = section
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Aggregate inbound movements by date+symbol to avoid one-row-per-share clutter.
  // Handles both "Gift Share" promotions and "SI IN" broker transfers (and any other
  // incoming security movement with a positive quantity).
  const giftMap = new Map<string, {
    date: string; symbol: string; name: string;
    currency: string; exchange: string; qty: number; notes: string;
  }>();

  let currentDate = '';
  let prevTimeLine = '';   // the "HH:MM:SS Other EXCHANGE SecurityName" line

  for (const line of lines) {
    // Pure date line: YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(line)) {
      currentDate = line;
      continue;
    }

    // Skip section / header lines
    if (/^(Movement|Date\/Time|Changes in)/.test(line)) continue;

    // Time + context line: HH:MM:SS ... Other ... exchange ... security_name
    if (/^\d{2}:\d{2}:\d{2}/.test(line) && line.includes('Other')) {
      prevTimeLine = line;
      continue;
    }

    // Inbound movement line: starts with a ticker symbol, contains a positive
    // quantity (+N), and represents an "In" transfer (Gift Share, SI IN, etc.)
    // Format (after tab→space normalization):
    //   "SYMBOL CURRENCY In +QTY COMMENT"
    const isInbound =
      /^[A-Z]{1,6}\b/.test(line) &&     // starts with a ticker
      /\+\d+/.test(line) &&             // has a positive quantity
      (/\bIn\b/.test(line) || line.includes('Gift Share')); // direction is In

    if (isInbound && currentDate) {
      const qtyMatch = line.match(/\+(\d+)/);
      if (!qtyMatch) continue;
      const qty = parseInt(qtyMatch[1], 10);

      const currencyMatch = line.match(/\b(USD|AUD|HKD)\b/);
      const currency = currencyMatch ? currencyMatch[1] : 'USD';

      // Symbol: leading run of uppercase letters (ticker)
      const symMatch = line.match(/^([A-Z]{1,6})\b/);
      if (!symMatch) continue;
      const symbol = symMatch[1];

      // Comment: everything after the "+QTY " token
      const commentMatch = line.match(/\+\d+\s+(.*)/);
      const comment = commentMatch ? commentMatch[1].trim() : '';
      const notes = comment === 'Gift Share'
        ? 'Gift Share from Moomoo'
        : comment
          ? `Transfer In (${comment}) — update cost base`
          : 'Transfer In — update cost base';

      // Extract exchange + security name from the preceding time line
      let securityName = symbol;
      let exchange = 'US';
      if (prevTimeLine) {
        // Match the exchange code, then grab everything after it as the name
        const ctx = prevTimeLine.match(/\b(US|ASX|HK)\b\s+(.+)/i);
        if (ctx) {
          exchange = ctx[1].toUpperCase();
          securityName = ctx[2].trim();
        }
      }

      const key = `${currentDate}|${symbol}`;
      const existing = giftMap.get(key);
      if (existing) {
        existing.qty += qty;
      } else {
        giftMap.set(key, { date: currentDate, symbol, name: securityName, currency, exchange, qty, notes });
      }
    }
  }

  return Array.from(giftMap.values()).map((g) => ({
    trade_date:    parseDate(g.date),
    trade_type:    'buy' as TradeType,
    symbol:        g.symbol,
    security_name: g.name,
    exchange:      g.exchange,
    currency:      g.currency,
    quantity:      g.qty,
    price:         0,
    amount:        0,
    brokerage:     0,
    gst:           0,
    exchange_rate: 1,
    notes:         g.notes,
  }));
}

export function parseCashSection(section: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Track currency context as we move through AUD / USD / HKD subsections
  let currentCurrency = 'AUD';
  const CURRENCY_HEADERS = new Set(['AUD', 'USD', 'HKD', 'SGD', 'EUR', 'GBP']);

  // Matches dated cash-flow lines:
  //   "2025/07/17 18:43:59  Asset Adjustment  +8.98  FANG CASH DIVIDEND"
  //   "2024/09/30 13:41:14  Cash In Out       +515.30  ZEPTO_PR.2m3pdi"
  const pattern =
    /^(\d{4}\/\d{2}\/\d{2})\s+\d{2}:\d{2}:\d{2}\s+(Asset Adjustment|Coupon|Cash In Out)\s+([+-][\d,\.]+)\s*(.*)$/;

  for (const line of lines) {
    // Detect currency section headers (bare "AUD", "USD", etc.)
    if (CURRENCY_HEADERS.has(line)) {
      currentCurrency = line;
      continue;
    }

    const match = line.match(pattern);
    if (!match) continue;

    const [, dateStr, type, amountStr, comment] = match;
    const amount = parseNumber(amountStr);

    let trade_type: TradeType;
    let symbol: string;
    let notes: string;

    if (type === 'Asset Adjustment' && /dividend/i.test(comment)) {
      if (amount <= 0) continue;
      trade_type = 'dividend';
      symbol = comment.split(/\s+/)[0].toUpperCase();
      notes = comment.trim();
    } else if (type === 'Coupon') {
      if (amount <= 0) continue;
      trade_type = 'interest';
      symbol = 'CASH';
      notes = comment.trim() || 'Moomoo Cash Coupon';
    } else if (type === 'Cash In Out') {
      // Skip zero-amount lines
      if (amount === 0) continue;
      trade_type = amount > 0 ? 'deposit' : 'withdrawal';
      symbol = 'CASH';
      notes = comment.trim() || type;
    } else {
      continue;
    }

    trades.push({
      trade_date:    parseDate(dateStr),
      trade_type,
      symbol,
      security_name: trade_type === 'deposit' ? 'Cash Deposit' : trade_type === 'withdrawal' ? 'Cash Withdrawal' : notes,
      exchange:      currentCurrency,   // re-used to carry currency context
      currency:      currentCurrency,
      quantity:      1,
      price:         Math.abs(amount),
      amount:        Math.abs(amount),
      brokerage:     0,
      gst:           0,
      notes,
    });
  }

  return trades;
}
