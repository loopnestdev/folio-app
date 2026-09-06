import type { Trade, HoldingPosition, CgtLot } from '../../types';

interface FifoLot {
  trade_date: string;
  quantity: number;
  /** Unit cost in the trade's native currency (e.g. USD). */
  unit_cost: number;
  /** Unit cost converted to portfolio base currency (AUD) using exchange_rate at purchase. */
  unit_cost_aud: number;
  currency: string;
  exchange_rate: number;
}

type TradeWithSecurity = Trade & {
  security?: { symbol: string; name: string | null; exchange: string | null; currency: string };
};

/**
 * Calculate the current cash balance and deposit/withdrawal totals from a
 * trade list. Cash = deposits − withdrawals − buy costs + sell proceeds +
 * dividends + interest. All amounts are in the portfolio's base currency.
 */
export function calculateCashPosition(trades: TradeWithSecurity[]): {
  cash_balance:    number;
  total_deposited: number;
  total_withdrawn: number;
} {
  let cash       = 0;
  let deposited  = 0;
  let withdrawn  = 0;

  for (const t of trades) {
    const fx  = t.exchange_rate ?? 1;
    const amt = t.price * t.quantity;   // native currency amount
    const aud = amt * fx;               // base-currency equivalent

    switch (t.trade_type) {
      case 'deposit':
        cash      += aud;
        deposited += aud;
        break;
      case 'withdrawal':
        cash      -= aud;
        withdrawn += aud;
        break;
      case 'fx_transfer_in':
        // Internal conversion between this account's own currency sleeves —
        // moves cash but is not new external capital, so it must not touch
        // deposited/withdrawn (those drive return/performance calculations).
        cash += aud;
        break;
      case 'fx_transfer_out':
        cash -= aud;
        break;
      case 'buy':
      case 'drp':
        // Cost out: share cost + brokerage
        cash -= (amt + (t.brokerage ?? 0)) * fx;
        break;
      case 'sell':
        // Proceeds in: share proceeds − brokerage
        cash += (amt - (t.brokerage ?? 0)) * fx;
        break;
      case 'dividend':
      case 'interest':
      case 'other_income':
        cash += aud;
        break;
      default:
        break;
    }
  }

  return {
    cash_balance:    Math.round(cash * 100)      / 100,
    total_deposited: Math.round(deposited * 100) / 100,
    total_withdrawn: Math.round(withdrawn * 100) / 100,
  };
}

export function calculateHoldings(
  trades: TradeWithSecurity[],
  currentPrices: Record<string, number>
): HoldingPosition[] {
  const fifo: Record<string, FifoLot[]> = {};
  const securityInfo: Record<string, { name: string; exchange: string; currency: string; id: string }> = {};

  const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  for (const trade of sorted) {
    if (!trade.security) continue;
    const sym = trade.security.symbol;

    if (!securityInfo[sym]) {
      securityInfo[sym] = {
        name: trade.security.name ?? sym,
        exchange: trade.security.exchange ?? '',
        currency: trade.security.currency,
        id: trade.security_id ?? '',
      };
    }

    if (!fifo[sym]) fifo[sym] = [];

    if (trade.trade_type === 'buy' || trade.trade_type === 'drp' || trade.trade_type === 'transfer_in') {
      // transfer_in: shares received with a recorded cost basis, no cash outflow.
      // The price field holds the cost-basis per share (for CGT). Brokerage is 0.
      const rate = trade.exchange_rate ?? 1;
      const brok = trade.trade_type === 'transfer_in' ? 0 : (trade.brokerage ?? 0);
      const unitCost = (trade.price * trade.quantity + brok) / trade.quantity;
      fifo[sym].push({
        trade_date: trade.trade_date,
        quantity: trade.quantity,
        unit_cost: unitCost,
        unit_cost_aud: unitCost * rate,
        currency: trade.currency,
        exchange_rate: rate,
      });
    } else if (trade.trade_type === 'sell') {
      let remaining = trade.quantity;
      while (remaining > 0 && fifo[sym].length > 0) {
        const lot = fifo[sym][0];
        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          fifo[sym].shift();
        } else {
          lot.quantity -= remaining;
          remaining = 0;
        }
      }
    }
  }

  const positions: HoldingPosition[] = [];

  for (const [sym, lots] of Object.entries(fifo)) {
    if (!lots.length) continue;
    const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
    if (totalQty <= 0) continue;

    const totalCost = lots.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
    const avgCost = totalCost / totalQty;
    // Use null when no price is available so the UI can show "—" instead of
    // a misleading $0.00 / -100% for securities Yahoo Finance doesn't cover.
    const currentPrice = currentPrices[sym] ?? null;
    const marketValue = currentPrice != null ? currentPrice * totalQty : null;
    const unrealizedGain = marketValue != null ? marketValue - totalCost : null;
    const unrealizedGainPct =
      unrealizedGain != null && totalCost > 0 ? (unrealizedGain / totalCost) * 100 : null;

    const info = securityInfo[sym];
    positions.push({
      security_id: info?.id ?? '',
      symbol: sym,
      security_name: info?.name ?? sym,
      exchange: info?.exchange ?? '',
      currency: info?.currency ?? 'AUD',
      quantity: totalQty,
      avg_cost: avgCost,
      cost_base: totalCost,
      current_price: currentPrice,
      market_value: marketValue,
      unrealized_gain: unrealizedGain,
      unrealized_gain_pct: unrealizedGainPct,
    });
  }

  return positions.sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
}

export function calculateCapitalGains(
  trades: TradeWithSecurity[],
  fyStart: 'january' | 'july',
  year: number
): CgtLot[] {
  const fifo: Record<string, FifoLot[]> = {};
  const securityNames: Record<string, string> = {};
  const cgtLots: CgtLot[] = [];

  let fyStartDate: string;
  let fyEndDate: string;
  if (fyStart === 'july') {
    fyStartDate = `${year - 1}-07-01`;
    fyEndDate = `${year}-06-30`;
  } else {
    fyStartDate = `${year}-01-01`;
    fyEndDate = `${year}-12-31`;
  }

  const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  for (const trade of sorted) {
    if (!trade.security) continue;
    const sym = trade.security.symbol;
    securityNames[sym] = trade.security.name ?? sym;

    if (!fifo[sym]) fifo[sym] = [];

    if (trade.trade_type === 'buy' || trade.trade_type === 'drp' || trade.trade_type === 'transfer_in') {
      // transfer_in: shares received with a recorded cost basis, no cash outflow.
      const rate = trade.exchange_rate ?? 1;
      const brok = trade.trade_type === 'transfer_in' ? 0 : (trade.brokerage ?? 0);
      const unitCost = (trade.price * trade.quantity + brok) / trade.quantity;
      fifo[sym].push({
        trade_date: trade.trade_date,
        quantity: trade.quantity,
        unit_cost: unitCost,
        unit_cost_aud: unitCost * rate,
        currency: trade.currency,
        exchange_rate: rate,
      });
    } else if (trade.trade_type === 'sell') {
      const inFy = trade.trade_date >= fyStartDate && trade.trade_date <= fyEndDate;
      // Convert sell price to AUD using the sell-side exchange rate
      const sellRate = trade.exchange_rate ?? 1;
      const netPricePerUnitAud = ((trade.price * trade.quantity - trade.brokerage) / trade.quantity) * sellRate;

      let remaining = trade.quantity;
      while (remaining > 0 && fifo[sym].length > 0) {
        const lot = fifo[sym][0];
        const qtyFromLot = Math.min(lot.quantity, remaining);
        // cost_base in AUD (uses exchange rate at time of PURCHASE — ATO requirement)
        const costBase = qtyFromLot * lot.unit_cost_aud;
        // proceeds in AUD (uses exchange rate at time of SALE — ATO requirement)
        const proceeds = qtyFromLot * netPricePerUnitAud;
        const grossGain = proceeds - costBase;

        if (inFy) {
          const buyDate = new Date(lot.trade_date);
          const sellDate = new Date(trade.trade_date);
          const holdDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / 86400000);
          const discountEligible = holdDays >= 365 && grossGain > 0;
          const discountAmount = discountEligible ? grossGain * 0.5 : 0;

          cgtLots.push({
            symbol: sym,
            security_name: securityNames[sym] ?? sym,
            buy_date: lot.trade_date,
            sell_date: trade.trade_date,
            quantity: qtyFromLot,
            cost_base: costBase,
            proceeds,
            gross_gain: grossGain,
            hold_days: holdDays,
            cgt_discount_eligible: discountEligible,
            cgt_discount_amount: discountAmount,
            net_gain: grossGain - discountAmount,
          });
        }

        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          fifo[sym].shift();
        } else {
          lot.quantity -= remaining;
          remaining = 0;
        }
      }
    }
  }

  return cgtLots;
}

/**
 * Same FIFO CGT calculation as calculateCapitalGains but accepts an arbitrary
 * date range instead of a financial year. All sells with sell_date within
 * [fromDate, toDate] are included; earlier sells still consume FIFO lots so
 * cost bases are always correct.
 */
export function calculateCapitalGainsByRange(
  trades: TradeWithSecurity[],
  fromDate: string,
  toDate: string,
): CgtLot[] {
  const fifo: Record<string, FifoLot[]> = {};
  const securityNames: Record<string, string> = {};
  const cgtLots: CgtLot[] = [];

  const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  for (const trade of sorted) {
    if (!trade.security) continue;
    const sym = trade.security.symbol;
    securityNames[sym] = trade.security.name ?? sym;

    if (!fifo[sym]) fifo[sym] = [];

    if (trade.trade_type === 'buy' || trade.trade_type === 'drp' || trade.trade_type === 'transfer_in') {
      const rate = trade.exchange_rate ?? 1;
      const brok = trade.trade_type === 'transfer_in' ? 0 : (trade.brokerage ?? 0);
      const unitCost = (trade.price * trade.quantity + brok) / trade.quantity;
      fifo[sym].push({
        trade_date:    trade.trade_date,
        quantity:      trade.quantity,
        unit_cost:     unitCost,
        unit_cost_aud: unitCost * rate,
        currency:      trade.currency,
        exchange_rate: rate,
      });
    } else if (trade.trade_type === 'sell') {
      const inRange   = trade.trade_date >= fromDate && trade.trade_date <= toDate;
      const sellRate  = trade.exchange_rate ?? 1;
      const netPricePerUnitAud = ((trade.price * trade.quantity - trade.brokerage) / trade.quantity) * sellRate;

      let remaining = trade.quantity;
      while (remaining > 0 && fifo[sym].length > 0) {
        const lot        = fifo[sym][0];
        const qtyFromLot = Math.min(lot.quantity, remaining);
        const costBase   = qtyFromLot * lot.unit_cost_aud;
        const proceeds   = qtyFromLot * netPricePerUnitAud;
        const grossGain  = proceeds - costBase;

        if (inRange) {
          const buyDate  = new Date(lot.trade_date);
          const sellDate = new Date(trade.trade_date);
          const holdDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / 86400000);
          const discountEligible = holdDays >= 365 && grossGain > 0;
          const discountAmount   = discountEligible ? grossGain * 0.5 : 0;
          cgtLots.push({
            symbol:               sym,
            security_name:        securityNames[sym] ?? sym,
            buy_date:             lot.trade_date,
            sell_date:            trade.trade_date,
            quantity:             qtyFromLot,
            cost_base:            costBase,
            proceeds,
            gross_gain:           grossGain,
            hold_days:            holdDays,
            cgt_discount_eligible: discountEligible,
            cgt_discount_amount:  discountAmount,
            net_gain:             grossGain - discountAmount,
          });
        }

        if (lot.quantity <= remaining) {
          remaining -= lot.quantity;
          fifo[sym].shift();
        } else {
          lot.quantity -= remaining;
          remaining = 0;
        }
      }
    }
  }

  return cgtLots;
}
