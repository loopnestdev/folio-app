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

export function parseTradesSection(section: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isBuy = line === 'Buy to Open' || line.startsWith('Buy to Open ');
    const isSell = line === 'Sell to Close' || line.startsWith('Sell to Close ');

    if (!isBuy && !isSell) {
      i++;
      continue;
    }

    const direction: TradeType = isBuy ? 'buy' : 'sell';
    let securityName = '';
    let cursor = i + 1;

    // Security name may be inline after direction keyword or on the next line
    const inlineMatch = line.match(/^(?:Buy to Open|Sell to Close)\s+(.+)$/);
    if (inlineMatch) {
      securityName = inlineMatch[1].trim();
    } else {
      securityName = lines[cursor] ?? '';
      cursor++;
    }

    // Symbol
    const symbol = lines[cursor] ?? '';
    cursor++;

    // "EXCHANGE CURRENCY" e.g. "ASX AUD" or "US USD"
    const exchangeLine = lines[cursor] ?? '';
    cursor++;
    const [exchange, currency] = exchangeLine.split(/\s+/);

    // Date: "2025/07/12"
    const dateLine = lines[cursor] ?? '';
    cursor++;
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateLine)) {
      i++;
      continue;
    }

    // Time: "05:52:12"
    cursor++; // skip time

    // Price Qty Amount on one line: "43.9700 21 923.37"
    const amountLine = lines[cursor] ?? '';
    cursor++;

    // Subtotal line
    const subtotalLine = lines[cursor] ?? '';
    cursor++;

    // Parse amount line: three numbers
    const numTokens = amountLine.split(/\s+/).filter((t) => /^[\d,\.]+$/.test(t));
    if (numTokens.length < 3) {
      i = cursor;
      continue;
    }
    const price = parseNumber(numTokens[0]);
    const quantity = parseNumber(numTokens[1]);
    const amount = parseNumber(numTokens[2]);

    const { brokerage, gst } = subtotalLine.startsWith('Subtotal:')
      ? parseFees(subtotalLine)
      : { brokerage: 0, gst: 0 };

    if (symbol && exchange && currency && price > 0 && quantity > 0) {
      trades.push({
        trade_date: parseDate(dateLine),
        trade_type: direction,
        symbol: symbol.toUpperCase(),
        security_name: securityName,
        exchange: exchange.trim(),
        currency: currency.trim(),
        quantity,
        price,
        amount,
        brokerage,
        gst,
      });
    }

    i = cursor;
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

  // Aggregate gift shares by date+symbol to avoid one-row-per-share clutter
  const giftMap = new Map<string, {
    date: string; symbol: string; name: string;
    currency: string; exchange: string; qty: number;
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

    // Gift Share line — must contain "+N" and the literal text "Gift Share"
    if (line.includes('Gift Share') && currentDate) {
      const qtyMatch = line.match(/\+(\d+)/);
      if (!qtyMatch) continue;
      const qty = parseInt(qtyMatch[1], 10);

      const currencyMatch = line.match(/\b(USD|AUD|HKD)\b/);
      const currency = currencyMatch ? currencyMatch[1] : 'USD';

      // Symbol: leading run of uppercase letters (ticker)
      const symMatch = line.match(/^([A-Z]{1,6})\b/);
      if (!symMatch) continue;
      const symbol = symMatch[1];

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
        giftMap.set(key, { date: currentDate, symbol, name: securityName, currency, exchange, qty });
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
    notes:         'Gift Share from Moomoo',
  }));
}

export function parseCashSection(section: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // "2025/07/17 18:43:59 Asset Adjustment +8.98 FANG CASH DIVIDEND"
  const pattern =
    /^(\d{4}\/\d{2}\/\d{2})\s+\d{2}:\d{2}:\d{2}\s+(Asset Adjustment|Coupon)\s+([+-][\d,\.]+)\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;

    const [, dateStr, type, amountStr, comment] = match;
    const amount = parseNumber(amountStr);
    if (amount <= 0) continue;

    let trade_type: TradeType;
    let symbol: string;

    if (type === 'Asset Adjustment' && /dividend/i.test(comment)) {
      trade_type = 'dividend';
      symbol = comment.split(/\s+/)[0].toUpperCase();
    } else if (type === 'Coupon') {
      trade_type = 'interest';
      symbol = 'CASH';
    } else {
      continue;
    }

    trades.push({
      trade_date: parseDate(dateStr),
      trade_type,
      symbol,
      security_name: comment.trim(),
      exchange: 'ASX',
      currency: 'AUD',
      quantity: 1,
      price: amount,
      amount,
      brokerage: 0,
      gst: 0,
      notes: comment.trim(),
    });
  }

  return trades;
}
