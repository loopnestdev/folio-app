import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnpricedHoldingsNotice } from './PerformanceChart';
import { summarizeUnpriced } from '../../lib/unpriced';
import type { PerformancePoint } from '../../types';

const point = (date: string, unpriced?: string[]): PerformancePoint => ({
  date, portfolio_value: 0, benchmark_sp500: null, benchmark_nasdaq: null, benchmark_asx200: null,
  ...(unpriced ? { unpriced } : {}),
});

describe('summarizeUnpriced', () => {
  it('counts days and the date span per symbol, most days first', () => {
    const data = [point('2026-10-05'), point('2026-10-06', ['IBTC']), point('2026-10-07', ['IBTC', 'XYZ']), point('2026-10-08', ['IBTC'])];
    expect(summarizeUnpriced(data)).toEqual([
      { symbol: 'IBTC', days: 3, from: '2026-10-06', to: '2026-10-08' },
      { symbol: 'XYZ', days: 1, from: '2026-10-07', to: '2026-10-07' },
    ]);
  });

  it('is empty when every holding was priced', () => {
    expect(summarizeUnpriced([point('2026-10-05'), point('2026-10-06')])).toEqual([]);
  });
});

describe('UnpricedHoldingsNotice', () => {
  it('lists the unpriced holdings', () => {
    render(<UnpricedHoldingsNotice data={[point('2026-10-06', ['IBTC']), point('2026-10-07', ['IBTC'])]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No price data for one holding');
    expect(screen.getByRole('status')).toHaveTextContent('IBTC · 2 days (2026-10-06 – 2026-10-07)');
  });

  it('renders nothing when all holdings were priced', () => {
    const { container } = render(<UnpricedHoldingsNotice data={[point('2026-10-06')]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
