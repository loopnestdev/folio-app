import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Percent } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupMonthlyProfit } from '../../hooks/useGroupReports';
import { Card } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { MonthlyProfitChart } from '../../components/charts/MonthlyProfitChart';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, getValueColor } from '../../lib/utils';
import type { DateRange, MonthlyProfit } from '../../types';

export function GroupMonthlyProfitPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);
  const baseCurrency = group?.base_currency ?? 'AUD';

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();
  const [chartMode, setChartMode] = useState<'profit' | 'percent'>('profit');

  const { data: monthlyData = [], isLoading } = useGroupMonthlyProfit({
    groupId: id,
    range,
    customStart,
    customEnd,
  });

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const totalProfit    = monthlyData.reduce((s, m) => s + m.profit, 0);
  const winningMonths  = monthlyData.filter((m) => m.profit > 0).length;
  const bestMonth      = monthlyData.reduce((best, m) => (m.profit > (best?.profit ?? -Infinity) ? m : best), monthlyData[0]);
  const worstMonth     = monthlyData.reduce((worst, m) => (m.profit < (worst?.profit ?? Infinity) ? m : worst), monthlyData[0]);

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
            {formatCurrency(val, baseCurrency)}
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
      {/* Back link */}
      <Link
        to={`/groups/${id}`}
        className="inline-flex items-center gap-1.5 text-[14px] text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
      >
        <ArrowLeft size={15} />
        Back to {group?.name ?? 'Group'}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Monthly Profit</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            Month-by-month profit and loss · {group?.name ?? 'Group'} · in {baseCurrency}
          </p>
        </div>
        <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total P&L"
          value={formatCurrency(totalProfit, baseCurrency)}
          subtitle={totalProfit >= 0 ? 'Cumulative gain' : 'Cumulative loss'}
        />
        <StatCard label="Winning Months" value={`${winningMonths}`} subtitle={`of ${monthlyData.length} months`} />
        <StatCard
          label="Best Month"
          value={bestMonth ? formatCurrency(bestMonth.profit, baseCurrency) : '—'}
          subtitle={bestMonth ? `${bestMonth.month_label} · ${bestMonth.return_pct >= 0 ? '+' : ''}${bestMonth.return_pct.toFixed(2)}%` : undefined}
        />
        <StatCard
          label="Worst Month"
          value={worstMonth ? formatCurrency(worstMonth.profit, baseCurrency) : '—'}
          subtitle={worstMonth ? `${worstMonth.month_label} · ${worstMonth.return_pct.toFixed(2)}%` : undefined}
        />
      </div>

      {/* Chart */}
      <Card>
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Monthly P&L</h2>
            <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">Amounts in {baseCurrency} at today's FX rate</p>
          </div>
          <div className="flex items-center bg-[var(--c-canvas-soft)] rounded-full p-1 gap-0.5">
            <button
              onClick={() => setChartMode('profit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                chartMode === 'profit'
                  ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
                  : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]'
              }`}
            >
              <DollarSign size={13} /> Amount
            </button>
            <button
              onClick={() => setChartMode('percent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                chartMode === 'percent'
                  ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
                  : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]'
              }`}
            >
              <Percent size={13} /> Return %
            </button>
          </div>
        </div>
        <MonthlyProfitChart data={monthlyData} currency={baseCurrency} mode={chartMode} />
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
