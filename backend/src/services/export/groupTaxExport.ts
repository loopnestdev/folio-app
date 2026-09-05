import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import type { GroupTaxData } from '../reports/groupTax';

export function buildGroupTaxWorkbook(data: GroupTaxData): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Tax Summary ──────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ['Group Tax Report', data.financial_year],
    ['Base Currency', data.base_currency],
    ['Period', `${data.fy_start_date} to ${data.fy_end_date}`],
    [],
    ['Dividends Received', data.dividends_received],
    ['Interest Received', data.interest_received],
    ['Other Income Received', data.other_income_received],
    ['Capital Gains (Short Term)', data.capital_gains_short_term],
    ['Capital Gains (Long Term)', data.capital_gains_long_term],
    ['Less: CGT Discount Applied', -data.cgt_discount_applied],
    ['Total Taxable Income', data.total_taxable_income],
    [],
    ['Note: foreign-currency dividends, interest, and other income are each converted to',
     `${data.base_currency} at their own payment date's exchange rate (same method as capital gains'`],
    ['disposal-date rate), so this summary always agrees with the Trade Ledger sheet below.'],
    [],
    ['By Portfolio'],
    ['Portfolio', 'Currency', 'FX Rate (today, for reference only)', 'Dividends', 'Interest', 'Other Income', 'CGT Short', 'CGT Long', 'CGT Discount', 'Taxable Income'],
    ...data.portfolios.map(p => [
      p.portfolio_name, p.portfolio_currency, p.fx_rate,
      p.dividends_received, p.interest_received, p.other_income_received,
      p.capital_gains_short_term, p.capital_gains_long_term,
      -p.cgt_discount_applied, p.total_taxable_income,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Tax Summary');

  // ── Sheet 2: Trade Ledger ─────────────────────────────────────────────────
  const tradeHeader = [
    'Portfolio', 'Date', 'Type', 'Symbol', 'Security', 'Quantity', 'Price (Native)',
    'Brokerage (Native)', 'Currency', 'Amount (Native)', 'FX Rate', `Amount (${data.base_currency})`,
  ];
  const tradeRows = data.trades.map(t => [
    t.portfolio_name, t.trade_date, t.trade_type, t.symbol, t.security_name ?? '',
    t.quantity, t.price, t.brokerage, t.portfolio_currency, t.amount_native, t.fx_rate, t.amount_base,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tradeHeader, ...tradeRows]), 'Trade Ledger');

  // ── Sheet 3: Capital Gains Detail ────────────────────────────────────────
  const cgtHeader = [
    'Portfolio', 'Symbol', 'Security', 'Buy Date', 'Sell Date', 'Held (Days)', 'Quantity',
    'Cost Base (Native)', 'Proceeds (Native)', 'Gross Gain (Native)', 'CGT Discount Eligible',
    'Net Gain (Native)', 'FX Rate (sell date)', `Net Gain (${data.base_currency})`,
  ];
  const cgtRows = data.cgt_lots.map(l => [
    l.portfolio_name, l.symbol, l.security_name, l.buy_date, l.sell_date, l.hold_days, l.quantity,
    l.cost_base, l.proceeds, l.gross_gain, l.cgt_discount_eligible ? 'Yes' : 'No',
    l.net_gain, l.fx_rate, l.net_gain_base,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cgtHeader, ...cgtRows]), 'Capital Gains');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const fmtMoney = (base: string, n: number) =>
  `${base} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildGroupTaxPdf(data: GroupTaxData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Page 1: Summary ──────────────────────────────────────────────────
    doc.fontSize(18).fillColor('#000').text(`Group Tax Report — ${data.financial_year}`);
    doc.fontSize(10).fillColor('#555')
      .text(`Period: ${data.fy_start_date} to ${data.fy_end_date}  ·  Base currency: ${data.base_currency}`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor('#000').text('Tax Summary');
    doc.moveDown(0.3);
    doc.fontSize(10);
    const summaryLines: [string, number][] = [
      ['Dividends Received', data.dividends_received],
      ['Interest Received', data.interest_received],
      ['Other Income Received', data.other_income_received],
      ['Capital Gains (Short Term)', data.capital_gains_short_term],
      ['Capital Gains (Long Term)', data.capital_gains_long_term],
      ['Less: CGT Discount Applied', -data.cgt_discount_applied],
    ];
    for (const [label, value] of summaryLines) {
      doc.text(`${label}:  ${fmtMoney(data.base_currency, value)}`);
    }
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Total Taxable Income:  ${fmtMoney(data.base_currency, data.total_taxable_income)}`, {
      underline: true,
    });
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#777').text(
      `Note: foreign-currency dividends, interest, and other income are each converted to ${data.base_currency} ` +
      `at their own payment date's exchange rate — the same method used for capital gains' disposal-date rate — ` +
      `so these totals always agree with the Trade Ledger page.`,
      { width: 700 },
    );
    doc.fillColor('#000');
    doc.moveDown(1);

    if (data.portfolios.length > 1) {
      doc.fontSize(13).fillColor('#000').text('By Portfolio');
      doc.moveDown(0.3);
      doc.fontSize(9);
      for (const p of data.portfolios) {
        doc.text(
          `${p.portfolio_name} (${p.portfolio_currency})  —  Taxable income: ${fmtMoney(data.base_currency, p.total_taxable_income)}`,
        );
      }
      doc.moveDown(1);
    }

    // ── A simple paginated table renderer shared by the ledger + CGT pages ──
    const renderTable = (
      title: string,
      headers: string[],
      colWidths: number[],
      rows: string[][],
    ) => {
      doc.addPage();
      doc.fontSize(13).fillColor('#000').text(`${title} — ${rows.length} rows`);
      doc.moveDown(0.4);
      doc.fontSize(8);

      const startX = doc.page.margins.left;
      const colX: number[] = [];
      let x = startX;
      for (const w of colWidths) { colX.push(x); x += w; }

      const drawHeader = () => {
        const y = doc.y;
        doc.fillColor('#000');
        headers.forEach((h, i) => doc.text(h, colX[i], y, { width: colWidths[i], continued: false }));
        doc.moveDown(0.6);
        doc.moveTo(startX, doc.y).lineTo(x, doc.y).strokeColor('#ccc').stroke();
        doc.moveDown(0.2);
      };

      drawHeader();
      const pageBottom = doc.page.height - doc.page.margins.bottom;

      for (const row of rows) {
        if (doc.y > pageBottom - 20) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        row.forEach((v, i) => doc.text(v, colX[i], y, { width: colWidths[i] }));
        doc.moveDown(0.4);
      }
    };

    // ── Page 2+: Trade Ledger ────────────────────────────────────────────
    renderTable(
      'Trade Ledger',
      ['Date', 'Portfolio', 'Type', 'Symbol', 'Qty', 'Price', `Amount (Native)`, 'FX', `Amount (${data.base_currency})`],
      [55, 90, 55, 60, 55, 65, 85, 55, 85],
      data.trades.map(t => [
        t.trade_date, t.portfolio_name, t.trade_type, t.symbol,
        String(t.quantity), t.price.toFixed(4), t.amount_native.toFixed(2),
        t.fx_rate.toFixed(4), t.amount_base.toFixed(2),
      ]),
    );

    // ── Final page(s): Capital Gains Detail ──────────────────────────────
    if (data.cgt_lots.length > 0) {
      renderTable(
        'Capital Gains Detail',
        ['Sell Date', 'Buy Date', 'Portfolio', 'Symbol', 'Qty', 'Cost Base', 'Proceeds', 'Net Gain (Native)', `Net Gain (${data.base_currency})`],
        [60, 60, 90, 60, 50, 70, 70, 90, 90],
        data.cgt_lots.map(l => [
          l.sell_date, l.buy_date, l.portfolio_name, l.symbol, String(l.quantity),
          l.cost_base.toFixed(2), l.proceeds.toFixed(2), l.net_gain.toFixed(2), l.net_gain_base.toFixed(2),
        ]),
      );
    }

    doc.end();
  });
}
