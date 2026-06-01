import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useDividends, useUpcomingDividends } from '../../hooks/useReports';
import { Card, CardHeader } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate } from '../../lib/utils';
import type { DateRange, Dividend, ExpectedDividend } from '../../types';

export function DividendsPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();

  const { data: dividendData, isLoading } = useDividends({
    portfolioId,
    range,
    customStart,
    customEnd,
  });

  const { data: upcoming } = useUpcomingDividends({ portfolioId });

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const dividendColumns = [
    { key: 'payment_date', label: 'Date', sortable: true, render: (v: unknown) => formatDate(String(v)) },
    { key: 'symbol', label: 'Symbol', sortable: true, render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    {
      key: 'is_reinvested',
      label: 'DRIP',
      render: (v: unknown) => v ? <Badge variant="success">Reinvested</Badge> : <Badge variant="neutral">Cash</Badge>,
    },
    {
      key: 'franking_pct',
      label: 'Franking',
      align: 'right' as const,
      render: (v: unknown) => v != null ? `${Number(v).toFixed(0)}%` : '—',
    },
    { key: 'amount', label: 'Amount', align: 'right' as const, sortable: true, render: (v: unknown) => formatCurrency(Number(v), currency) },
  ];

  const upcomingColumns = [
    { key: 'expected_date', label: 'Expected Date', render: (v: unknown) => formatDate(String(v)) },
    { key: 'symbol', label: 'Symbol', render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    { key: 'frequency', label: 'Frequency' },
    { key: 'estimated_amount', label: 'Est. Amount', align: 'right' as const, render: (v: unknown) => formatCurrency(Number(v), currency) },
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Dividends & Interest</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Income from dividends and interest payments{activePortfolio?.name ? ` · ${activePortfolio.name}` : ''}</p>
        </div>
        <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Dividends"
          value={formatCurrency(dividendData?.total_dividends ?? 0, currency)}
        />
        <StatCard
          label="Total Interest"
          value={formatCurrency(dividendData?.total_interest ?? 0, currency)}
        />
        <StatCard
          label="Total Income"
          value={formatCurrency(dividendData?.total_income ?? 0, currency)}
        />
      </div>

      {/* Dividend history */}
      <Card padding="none">
        <div className="px-6 pt-5 pb-4">
          <CardHeader title="Payment History" />
        </div>
        <Table<Dividend>
          columns={dividendColumns as Parameters<typeof Table<Dividend>>[0]['columns']}
          data={dividendData?.dividends ?? []}
          keyField="id"
          emptyMessage="No dividend payments in this period"
        />
      </Card>

      {/* Upcoming dividends */}
      {upcoming && upcoming.dividends.length > 0 && (
        <Card padding="none">
          <div className="px-6 pt-5 pb-4">
            <CardHeader
              title="Expected Upcoming Payments"
              subtitle={`Estimated total: ${formatCurrency(upcoming.total_estimated, currency)}`}
            />
          </div>
          <Table<ExpectedDividend>
            columns={upcomingColumns as Parameters<typeof Table<ExpectedDividend>>[0]['columns']}
            data={upcoming.dividends}
            emptyMessage="No upcoming dividends"
          />
        </Card>
      )}
    </div>
  );
}
