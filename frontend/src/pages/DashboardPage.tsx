import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { useActivePortfolioSummary, useHoldings, useTrades } from '../hooks/usePortfolio';
import { usePerformance } from '../hooks/usePerformance';
import { StatCard } from '../components/ui/StatCard';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PortfolioForm } from '../components/forms/PortfolioForm';
import { useCreatePortfolio } from '../hooks/usePortfolio';
import { useToast } from '../components/ui/Toast';
import { formatCurrency, formatDate, getValueColor, cn } from '../lib/utils';
import type { Holding, Trade, BenchmarkToggle } from '../types';

export function DashboardPage() {
  const { activePortfolio } = usePortfolioContext();
  const { data: summary, isLoading: summaryLoading } = useActivePortfolioSummary();
  const { data: holdings = [] } = useHoldings(activePortfolio?.id);
  const { data: trades = [] } = useTrades(activePortfolio?.id);
  // Use ALL range so portfolios whose active period is more than 1Y ago
  // (e.g. a portfolio that was transferred out) still display their chart.
  const { data: performanceData = [], isLoading: perfLoading } = usePerformance({
    portfolioId: activePortfolio?.id,
    range: 'ALL',
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [ytdMode, setYtdMode] = useState<'CY' | 'FY'>('CY');
  const [benchmarks, setBenchmarks] = useState<BenchmarkToggle>({ sp500: false, nasdaq: true, asx200: false });
  const toggleBenchmark = (key: keyof BenchmarkToggle) =>
    setBenchmarks(prev => ({ ...prev, [key]: !prev[key] }));
  const createPortfolio = useCreatePortfolio();
  const toast = useToast();

  const topHoldings = holdings
    .filter((h) => (h.market_value ?? 0) > 0)
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
    .slice(0, 5);

  const recentTrades = trades.slice(0, 5);

  if (!activePortfolio) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <div className="text-[64px] mb-4">📈</div>
          <h1 className="text-[28px] font-semibold text-[var(--c-ink)] mb-3">Welcome to Folio</h1>
          <p className="text-[17px] text-[var(--c-ink-mute)] max-w-md">
            Create your first portfolio to start tracking your investments, performance, and reports.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={<Plus size={20} />}
          onClick={() => setCreateOpen(true)}
        >
          Create Portfolio
        </Button>

        <PortfolioForm
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (values) => {
            try {
              await createPortfolio.mutateAsync({ ...values, description: values.description ?? null, group_id: values.group_id ?? null });
              toast.success('Portfolio created', `"${values.name}" is ready.`);
            } catch {
              toast.error('Failed to create portfolio');
            }
          }}
        />
      </div>
    );
  }

  const holdingColumns = [
    { key: 'symbol', label: 'Symbol', sortable: true,
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Name', render: (v: unknown) => String(v || '—') },
    { key: 'quantity', label: 'Qty', align: 'right' as const, sortable: true,
      render: (v: unknown) => String(v) },
    { key: 'market_value', label: 'Value', align: 'right' as const, sortable: true,
      render: (v: unknown) => formatCurrency(Number(v), activePortfolio.currency) },
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

  const tradeColumns = [
    { key: 'trade_date', label: 'Date', sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
    {
      key: 'security',
      label: 'Symbol',
      render: (_v: unknown, row: Trade) => (
        <span className="font-semibold text-[var(--c-primary)]">{row.security?.symbol ?? '—'}</span>
      ),
    },
    {
      key: 'trade_type',
      label: 'Type',
      render: (v: unknown) => {
        const isBuy = v === 'buy' || v === 'drp';
        return (
          <span className="inline-flex items-center gap-1" style={{ color: isBuy ? 'var(--c-bull)' : 'var(--c-bear)' }}>
            {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {String(v).toUpperCase()}
          </span>
        );
      },
    },
    { key: 'quantity', label: 'Qty', align: 'right' as const, render: (v: unknown) => Number(v).toLocaleString() },
    {
      key: 'price',
      label: 'Price',
      align: 'right' as const,
      render: (_v: unknown, row: Trade) => formatCurrency(row.price, row.currency),
    },
    {
      key: 'brokerage',
      label: 'Total',
      align: 'right' as const,
      render: (_v: unknown, row: Trade) =>
        formatCurrency(row.price * row.quantity + (row.brokerage ?? 0), row.currency),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">
          {activePortfolio.name}
        </h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Portfolio overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Net Asset Value */}
        <StatCard
          label="Net Asset Value"
          tooltip="Total portfolio value: current market value of all holdings plus uninvested cash."
          value={formatCurrency(summary?.total_value ?? 0, activePortfolio.currency)}
          loading={summaryLoading}
        />

        {/* 2. Unrealised Gain */}
        <StatCard
          label="Unrealised Gain"
          tooltip="Profit or loss on currently held positions: market value of open holdings minus their original cost base. Does not include closed trades or cash."
          value={formatCurrency(summary?.total_gain ?? 0, activePortfolio.currency)}
          trend={summary?.total_gain_pct}
          subtitle={summary ? `Invested: ${formatCurrency(summary.invested_value ?? 0, activePortfolio.currency)}` : undefined}
          loading={summaryLoading}
        />

        {/* 3. YTD Return — with CY / FY toggle */}
        {(() => {
          const isFY        = ytdMode === 'FY';
          const ytdValue    = isFY ? (summary?.fy_ytd_return ?? 0)     : (summary?.ytd_return     ?? 0);
          const ytdPct      = isFY ? (summary?.fy_ytd_return_pct ?? 0) : (summary?.ytd_return_pct ?? 0);
          const fyYear      = summary?.fy_start_date ? summary.fy_start_date.slice(0, 4) : '';
          const periodLabel = isFY
            ? `AU FY${fyYear ? ` (Jul ${fyYear})` : ''}`
            : `Calendar year (Jan ${new Date().getFullYear()})`;
          return (
            <StatCard
              label="YTD Return"
              tooltip="Change in total portfolio value since the start of the selected period (calendar year Jan 1 or Australian financial year Jul 1). Includes stocks and cash at both the start and end dates."
              value={formatCurrency(ytdValue, activePortfolio.currency)}
              trend={ytdPct ?? undefined}
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
          tooltip="Uninvested cash balance (deposits minus withdrawals minus stock purchases plus sale proceeds)."
          value={formatCurrency(summary?.cash_balance ?? 0, activePortfolio.currency)}
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
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Performance</h2>
            <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">Time-weighted return vs benchmarks</p>
          </div>
          {/* Benchmark toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'sp500',  label: 'S&P 500',  color: '#059669' },
              { key: 'nasdaq', label: 'NASDAQ',   color: '#d97706' },
              { key: 'asx200', label: 'ASX 200',  color: '#5856d6' },
            ] as { key: keyof BenchmarkToggle; label: string; color: string }[]).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleBenchmark(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                  benchmarks[key]
                    ? 'border-transparent text-white'
                    : 'border-[var(--c-border)] text-[var(--c-ink-mute)] bg-transparent hover:border-[var(--c-primary-border)]'
                }`}
                style={benchmarks[key] ? { backgroundColor: color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: benchmarks[key] ? 'white' : color }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <PerformanceChart
          data={performanceData}
          benchmarks={benchmarks}
          currency={activePortfolio.currency}
          loading={perfLoading}
        />
      </Card>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top holdings */}
        <Card padding="none">
          <div className="px-6 pt-5 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Top Holdings</h2>
              <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">By market value</p>
            </div>
            <Link
              to={`/portfolios/${activePortfolio.id}/holdings`}
              className="text-[15px] text-[var(--c-primary)] font-medium flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <Table<Holding>
            columns={holdingColumns as Parameters<typeof Table<Holding>>[0]['columns']}
            data={topHoldings}
            keyField="id"
            emptyMessage="No holdings yet"
          />
        </Card>

        {/* Recent trades */}
        <Card padding="none">
          <div className="px-6 pt-5 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Recent Trades</h2>
              <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">Last 5 transactions</p>
            </div>
            <Link
              to={`/portfolios/${activePortfolio.id}/trades`}
              className="text-[15px] text-[var(--c-primary)] font-medium flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <Table<Trade>
            columns={tradeColumns as Parameters<typeof Table<Trade>>[0]['columns']}
            data={recentTrades as Trade[]}
            keyField="id"
            emptyMessage="No trades yet"
          />
        </Card>
      </div>
    </div>
  );
}
