import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Layers, FileText, Receipt } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupSummary, useGroupPerformance } from '../../hooks/useGroupReports';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { PerformanceChart } from '../../components/charts/PerformanceChart';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, getValueColor, cn } from '../../lib/utils';
import type { DateRange, BenchmarkToggle, GroupPortfolioBreakdown } from '../../types';

export function GroupDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [perfRange, setPerfRange] = useState<DateRange>('ALL');
  const [perfStart, setPerfStart] = useState<string>();
  const [perfEnd,   setPerfEnd]   = useState<string>();
  const [benchmarks, setBenchmarks] = useState<BenchmarkToggle>({
    sp500: false, nasdaq: true, asx200: false,
  });
  const toggleBenchmark = (key: keyof BenchmarkToggle) =>
    setBenchmarks((prev) => ({ ...prev, [key]: !prev[key] }));

  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);

  const { data: summary, isLoading: summaryLoading } = useGroupSummary(id);
  const { data: performanceData = [], isLoading: perfLoading } = useGroupPerformance({
    groupId: id, range: perfRange, customStart: perfStart, customEnd: perfEnd,
  });

  const baseCurrency = summary?.base_currency ?? group?.base_currency ?? 'AUD';

  const portfolioColumns = [
    {
      key: 'name',
      label: 'Portfolio',
      render: (v: unknown) => <span className="font-medium text-[var(--c-ink)]">{String(v)}</span>,
    },
    { key: 'currency', label: 'Currency', render: (v: unknown) => String(v) },
    {
      key: 'fx_rate',
      label: `FX Rate → ${baseCurrency}`,
      align: 'right' as const,
      render: (_v: unknown, row: GroupPortfolioBreakdown) =>
        row.currency === baseCurrency ? '—' : row.fx_rate.toFixed(4),
    },
    {
      key: 'total_value_base',
      label: `Value (${baseCurrency})`,
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => formatCurrency(Number(v), baseCurrency),
    },
    {
      key: 'total_gain_base',
      label: `Gain (${baseCurrency})`,
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const val = Number(v);
        return <span style={{ color: getValueColor(val) }} className="font-medium">{formatCurrency(val, baseCurrency)}</span>;
      },
    },
    {
      key: 'ytd_return_base',
      label: `YTD (${baseCurrency})`,
      align: 'right' as const,
      render: (v: unknown) => {
        const val = Number(v);
        return <span style={{ color: getValueColor(val) }} className="font-medium">{formatCurrency(val, baseCurrency)}</span>;
      },
    },
  ];

  if (!group && groups.length > 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[var(--c-ink-mute)]">Group not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers size={20} className="text-[var(--c-primary)]" />
            <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">
              {group?.name ?? '…'}
            </h1>
          </div>
          {group?.description && (
            <p className="text-[15px] text-[var(--c-ink-mute)]">{group.description}</p>
          )}
          <p className="text-[13px] text-[var(--c-ink-mute)] mt-1">
            Consolidated across {summary?.portfolios.length ?? '—'} portfolios · All values in {baseCurrency}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/groups/${id}/capital-gains`}
            className="flex items-center gap-1.5 text-[14px] text-[var(--c-primary)] font-medium hover:underline"
          >
            <FileText size={14} /> Capital Gains
          </Link>
          <span className="text-[var(--c-border)]">·</span>
          <Link
            to={`/groups/${id}/tax`}
            className="flex items-center gap-1.5 text-[14px] text-[var(--c-primary)] font-medium hover:underline"
          >
            <Receipt size={14} /> Tax Report
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Net Asset Value"
          value={formatCurrency(summary?.total_value ?? 0, baseCurrency)}
          loading={summaryLoading}
        />
        <StatCard
          label="Total Return"
          value={formatCurrency(summary?.total_gain ?? 0, baseCurrency)}
          trend={summary?.total_gain_pct}
          loading={summaryLoading}
        />
        <StatCard
          label="Return %"
          value={formatPercent(summary?.total_gain_pct ?? 0)}
          trend={summary?.total_gain_pct}
          loading={summaryLoading}
        />
        <StatCard
          label="YTD Return"
          value={formatCurrency(summary?.ytd_return ?? 0, baseCurrency)}
          trend={summary?.ytd_return_pct}
          loading={summaryLoading}
        />
      </div>

      {/* Performance chart */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <CardHeader
            title="Consolidated Performance"
            subtitle={`Time-weighted return vs benchmarks · values in ${baseCurrency} at current forex`}
          />
          <DateRangePicker
            value={perfRange}
            customStart={perfStart}
            customEnd={perfEnd}
            onChange={(r, s, e) => { setPerfRange(r); setPerfStart(s); setPerfEnd(e); }}
          />
        </div>

        {/* Benchmark toggles */}
        {(() => {
          const btns: { key: keyof BenchmarkToggle; label: string; color: string }[] = [
            { key: 'sp500',  label: 'S&P 500', color: '#059669' },
            { key: 'nasdaq', label: 'NASDAQ',  color: '#d97706' },
            { key: 'asx200', label: 'ASX 200', color: '#5856d6' },
          ];
          return (
            <div className="flex flex-wrap gap-2 mb-4">
              {btns.map((b) => (
                <button
                  key={b.key}
                  onClick={() => toggleBenchmark(b.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all',
                    benchmarks[b.key]
                      ? 'text-white border-transparent'
                      : 'bg-[var(--c-canvas)] text-[var(--c-ink-mute)] border-[var(--c-border)] hover:border-[var(--c-primary-border)]',
                  )}
                  style={benchmarks[b.key] ? { backgroundColor: b.color, borderColor: b.color } : {}}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: benchmarks[b.key] ? 'white' : b.color }} />
                  {b.label}
                </button>
              ))}
            </div>
          );
        })()}

        <PerformanceChart
          data={performanceData}
          benchmarks={benchmarks}
          currency={baseCurrency}
          loading={perfLoading}
        />
      </Card>

      {/* Portfolio breakdown */}
      {summaryLoading ? <PageLoader /> : (
        <Card padding="none">
          <div className="px-6 pt-5 pb-1">
            <h2 className="text-[17px] font-semibold text-[var(--c-ink)]">Portfolio Breakdown</h2>
            <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">
              Individual contributions converted to {baseCurrency} at current forex rates
            </p>
          </div>
          <Table<GroupPortfolioBreakdown>
            columns={portfolioColumns as Parameters<typeof Table<GroupPortfolioBreakdown>>[0]['columns']}
            data={summary?.portfolios ?? []}
            keyField="id"
            emptyMessage="No portfolios in this group yet"
          />
          <div className="px-6 py-4 border-t border-[var(--c-border)] flex gap-3">
            <Link
              to={`/groups/${id}/capital-gains`}
              className="flex items-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium hover:underline"
            >
              View Capital Gains <ArrowRight size={15} />
            </Link>
            <Link
              to={`/groups/${id}/tax`}
              className="flex items-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium hover:underline"
            >
              View Tax Report <ArrowRight size={15} />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
