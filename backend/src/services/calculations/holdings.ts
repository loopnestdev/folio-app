import type { Trade, HoldingPosition, CgtLot } from '../../types';

interface FifoLot {
  trade_date: string;
  quantity: number;
  unit_cost: number;
  currency: string;
}

type TradeWithSecurity = Trade & {
  security?: { symbol: string; name: string | null; exchange: string | null; currency: string };
};

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

    if (trade.trade_type === 'buy' || trade.trade_type === 'drp') {
      const unitCost = (trade.price * trade.quantity + trade.brokerage) / trade.quantity;
      fifo[sym].push({
        trade_date: trade.trade_date,
        quantity: trade.quantity,
        unit_cost: unitCost,
        currency: trade.currency,
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
    const currentPrice = currentPrices[sym] ?? 0;
    const marketValue = currentPrice * totalQty;
    const unrealizedGain = marketValue - totalCost;
    const unrealizedGainPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;

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

  return positions.sort((a, b) => b.market_value - a.market_value);
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

    if (trade.trade_type === 'buy' || trade.trade_type === 'drp') {
      const unitCost = (trade.price * trade.quantity + trade.brokerage) / trade.quantity;
      fifo[sym].push({ trade_date: trade.trade_date, quantity: trade.quantity, unit_cost: unitCost, currency: trade.currency });
    } else if (trade.trade_type === 'sell') {
      const inFy = trade.trade_date >= fyStartDate && trade.trade_date <= fyEndDate;
      const netPricePerUnit = (trade.price * trade.quantity - trade.brokerage) / trade.quantity;

      let remaining = trade.quantity;
      while (remaining > 0 && fifo[sym].length > 0) {
        const lot = fifo[sym][0];
        const qtyFromLot = Math.min(lot.quantity, remaining);
        const costBase = qtyFromLot * lot.unit_cost;
        const proceeds = qtyFromLot * netPricePerUnit;
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
