import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useMonthlyProfit } from '../../hooks/useReports';
import { Card, CardHeader } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { MonthlyProfitChart } from '../../components/charts/MonthlyProfitChart';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, getValueColor } from '../../lib/utils';
import type { DateRange, MonthlyProfit } from '../../types';

export function MonthlyProfitPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();

  const { data: monthlyData = [], isLoading } = useMonthlyProfit({
    portfolioId,
    range,
    customStart,
    customEnd,
  });

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const totalProfit = monthlyData.reduce((s, m) => s + m.profit, 0);
  const winningMonths = monthlyData.filter((m) => m.profit > 0).length;
  const bestMonth = monthlyData.reduce((best, m) => (m.profit > (best?.profit ?? -Infinity) ? m : best), monthlyData[0]);
  const worstMonth = monthlyData.reduce((worst, m) => (m.profit < (worst?.profit ?? Infinity) ? m : worst), monthlyData[0]);

  const columns = [
    { key: 'month_label', label: 'Month', sortable: true },
    {
      key: 'profit',
      label: 'Profit / Loss',
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
      key: 'return_pct',
      label: 'Return %',
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

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Monthly Profit</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Month-by-month profit and loss</p>
        </div>
        <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total P&L" value={formatCurrency(totalProfit, currency)} trend={totalProfit} />
        <StatCard label="Winning Months" value={`${winningMonths}`} subtitle={`of ${monthlyData.length} months`} />
        <StatCard label="Best Month" value={bestMonth ? formatCurrency(bestMonth.profit, currency) : '—'} trend={bestMonth?.profit} />
        <StatCard label="Worst Month" value={worstMonth ? formatCurrency(worstMonth.profit, currency) : '—'} trend={worstMonth?.profit} />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader title="Monthly P&L" />
        <MonthlyProfitChart data={monthlyData} currency={currency} />
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Monthly Detail</h2>
        </div>
        <Table<MonthlyProfit>
          columns={columns as Parameters<typeof Table<MonthlyProfit>>[0]['columns']}
          data={monthlyData}
          emptyMessage="No data available"
        />
      </Card>
    </div>
  );
}
