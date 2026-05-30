import { useParams } from 'react-router-dom';
import { useHoldings } from '../hooks/usePortfolio';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, getValueColor } from '../lib/utils';
import type { Holding } from '../types';

export function HoldingsPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';

  const { data: holdings = [], isLoading } = useHoldings(portfolioId);

  if (isLoading) return <PageLoader />;

  const totalValue = holdings.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const columns = [
    {
      key: 'symbol',
      label: 'Symbol',
      sortable: true,
      render: (v: unknown) => (
        <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span>
      ),
    },
    {
      key: 'security_name',
      label: 'Security',
      render: (v: unknown, row: Holding) => (
        <div>
          <div>{String(v || '—')}</div>
          {row.exchange && (
            <div className="text-[12px] text-[var(--c-ink-mute)]">{row.exchange}</div>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => Number(v).toLocaleString(),
    },
    {
      key: 'avg_cost',
      label: 'Avg Cost',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => formatCurrency(Number(v), currency),
    },
    {
      key: 'current_price',
      label: 'Current Price',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => v != null ? formatCurrency(Number(v), currency) : '—',
    },
    {
      key: 'market_value',
      label: 'Market Value',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => v != null ? formatCurrency(Number(v), currency) : '—',
    },
    {
      key: 'unrealized_gain',
      label: 'Unrealized Gain',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const val = Number(v);
        return (
          <span style={{ color: getValueColor(val) }} className="font-medium">
            {formatCurrency(val, currency)}
          </span>
        );
      },
    },
    {
      key: 'unrealized_gain_pct',
      label: 'Gain %',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const val = Number(v);
        return (
          <span style={{ color: getValueColor(val) }} className="font-medium">
            {formatPercent(val)}
          </span>
        );
      },
    },
  ];

  const footerCells = [
    <td key="label" className="px-4 py-3 text-[15px] text-[var(--c-ink)]" colSpan={5}>
      Total
    </td>,
    <td key="value" className="px-4 py-3 text-[15px] text-right text-[var(--c-ink)]">
      {formatCurrency(totalValue, currency)}
    </td>,
    <td key="gain" className="px-4 py-3 text-[15px] text-right" style={{ color: getValueColor(totalGain) }}>
      {formatCurrency(totalGain, currency)}
    </td>,
    <td key="gainpct" className="px-4 py-3 text-[15px] text-right" style={{ color: getValueColor(totalGainPct) }}>
      {formatPercent(totalGainPct)}
    </td>,
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Current Holdings</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
          {holdings.length} position{holdings.length !== 1 ? 's' : ''} &mdash; Total value:{' '}
          <strong>{formatCurrency(totalValue, currency)}</strong>
        </p>
      </div>

      <Card padding="none">
        <Table<Holding>
          columns={columns as Parameters<typeof Table<Holding>>[0]['columns']}
          data={holdings}
          keyField="id"
          emptyMessage="No holdings in this portfolio"
          footer={
            holdings.length > 0 ? (
              <>
                {footerCells}
              </>
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
