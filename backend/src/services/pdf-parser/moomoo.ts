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
