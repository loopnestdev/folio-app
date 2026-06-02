import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Layers, FileText, Receipt, BarChart3, Wallet } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupSummary, useGroupPerformance } from '../../hooks/useGroupReports';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { PerformanceChart } from '../../components/charts/PerformanceChart';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getValueColor, cn } from '../../lib/utils';
import type { DateRange, BenchmarkToggle, GroupPortfolioBreakdown } from '../../types';

export function GroupDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [perfRange, setPerfRange] = useState<DateRange>('ALL');
  const [perfStart, setPerfStart] = useState<string>();
  const [perfEnd,   setPerfEnd]   = useState<string>();
  const [benchmarks, setBenchmarks] = useState<BenchmarkToggle>({
    sp500: false, nasdaq: true, asx200: false,
  });
  // YTD mode: calendar year (Jan 1) or Australian financial year (Jul 1)
  const [ytdMode, setYtdMode] = useState<'CY' | 'FY'>('CY');
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
        <div className="flex gap-2 flex-wrap">
          <Link
            to={`/groups/${id}/monthly-profit`}
            className="flex items-center gap-1.5 text-[14px] text-[var(--c-primary)] font-medium hover:underline"
          >
            <BarChart3 size={14} /> Monthly Profit
          </Link>
          <span className="text-[var(--c-border)]">·</span>
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Net Asset Value */}
        <StatCard
          label="Net Asset Value"
          tooltip="Total portfolio value: current market value of all holdings plus uninvested cash, converted to the group base currency at today's forex rates."
          value={formatCurrency(summary?.total_value ?? 0, baseCurrency)}
          loading={summaryLoading}
        />

        {/* 2. Unrealised Gain */}
        <StatCard
          label="Unrealised Gain"
          tooltip="Profit or loss on currently held positions: market value of open holdings minus their original cost base. Does not include closed trades or cash."
          value={formatCurrency(summary?.total_gain ?? 0, baseCurrency)}
          trend={summary?.total_gain_pct}
          subtitle={summary ? `Invested: ${formatCurrency(summary.invested_value ?? 0, baseCurrency)}` : undefined}
          loading={summaryLoading}
        />

        {/* 3. YTD Return — with CY / FY toggle */}
        {(() => {
          const isFY       = ytdMode === 'FY';
          const ytdValue   = isFY ? (summary?.fy_ytd_return ?? 0)     : (summary?.ytd_return     ?? 0);
          const ytdPct     = isFY ? (summary?.fy_ytd_return_pct ?? 0) : (summary?.ytd_return_pct ?? 0);
          const fyYear     = summary?.fy_start_date ? summary.fy_start_date.slice(0, 4) : '';
          const periodLabel = isFY
            ? `AU FY${fyYear ? ` (Jul ${fyYear})` : ''}`
            : `Calendar year (Jan ${new Date().getFullYear()})`;
          return (
            <StatCard
              label="YTD Return"
              tooltip="Change in total portfolio value since the start of the selected period (calendar year Jan 1 or Australian financial year Jul 1). Includes stocks and cash at both the start and end dates."
              value={formatCurrency(ytdValue, baseCurrency)}
              trend={ytdPct}
              loading={summaryLoading}
              footer={
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--c-ink-mute)]">{periodLabel}</span>
                  <div className="flex rounded-lg overflow-hidden border border-[var(--c-border)] text-[11px] font-semibold">
                    {(['CY', 'FY'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setYtdMode(mode)}
                        className={cn(
                          'px-2 py-0.5 transition-colors',
                          ytdMode === mode
                            ? 'bg-[var(--c-primary)] text-white'
                            : 'text-[var(--c-ink-mute)] hover:bg-[var(--c-canvas-soft)]',
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
          );
        })()}

        {/* 4. Cash */}
        <StatCard
          label="Cash"
          tooltip="Uninvested cash across all portfolios (deposits minus withdrawals minus stock purchases plus sale proceeds), converted to the group base currency."
          value={formatCurrency(summary?.cash_balance ?? 0, baseCurrency)}
          icon={<Wallet size={16} />}
          subtitle={
            summary && summary.total_value > 0
              ? `${((summary.cash_balance ?? 0) / summary.total_value * 100).toFixed(1)}% of portfolio`
              : undefined
          }
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
          <div className="px-6 py-4 border-t border-[var(--c-border)] flex gap-3 flex-wrap">
            <Link
              to={`/groups/${id}/monthly-profit`}
              className="flex items-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium hover:underline"
            >
              Monthly Profit <ArrowRight size={15} />
            </Link>
            <Link
              to={`/groups/${id}/capital-gains`}
              className="flex items-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium hover:underline"
            >
              Capital Gains <ArrowRight size={15} />
            </Link>
            <Link
              to={`/groups/${id}/tax`}
              className="flex items-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium hover:underline"
            >
              Tax Report <ArrowRight size={15} />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
