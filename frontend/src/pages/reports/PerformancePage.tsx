import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { usePerformance } from '../../hooks/usePerformance';
import { Card } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { PerformanceChart } from '../../components/charts/PerformanceChart';
import { StatCard } from '../../components/ui/StatCard';
import type { DateRange, BenchmarkToggle } from '../../types';
import { formatCurrency, formatPercent, cn } from '../../lib/utils';

export function PerformancePage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();
  const [benchmarks, setBenchmarks] = useState<BenchmarkToggle>({
    sp500: true,
    nasdaq: false,
    asx200: false,
  });

  const { data: performanceData = [], isLoading } = usePerformance({
    portfolioId,
    range,
    customStart,
    customEnd,
  });

  const handleDateRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const toggleBenchmark = (key: keyof BenchmarkToggle) => {
    setBenchmarks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate summary stats from data
  const firstValue = performanceData[0]?.portfolio_value ?? 0;
  const lastValue = performanceData[performanceData.length - 1]?.portfolio_value ?? 0;
  const totalReturn = lastValue - firstValue;
  const totalReturnPct = firstValue > 0 ? (totalReturn / firstValue) * 100 : 0;

  const peakValue = Math.max(...performanceData.map((d) => d.portfolio_value), 0);
  const troughValue = Math.min(...performanceData.filter((d) => d.portfolio_value > 0).map((d) => d.portfolio_value), peakValue);
  const maxDrawdown = peakValue > 0 ? ((troughValue - peakValue) / peakValue) * 100 : 0;

  const benchmarkButtons: { key: keyof BenchmarkToggle; label: string; color: string }[] = [
    { key: 'sp500', label: 'S&P 500', color: '#059669' },
    { key: 'nasdaq', label: 'NASDAQ', color: '#d97706' },
    { key: 'asx200', label: 'ASX 200', color: '#5856d6' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Performance</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Portfolio returns over time</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Period Return"
          value={formatCurrency(totalReturn, currency)}
          trend={totalReturnPct}
          loading={isLoading}
        />
        <StatCard
          label="Return %"
          value={formatPercent(totalReturnPct)}
          loading={isLoading}
        />
        <StatCard
          label="Peak Value"
          value={formatCurrency(peakValue, currency)}
          loading={isLoading}
        />
        <StatCard
          label="Max Drawdown"
          value={formatPercent(maxDrawdown)}
          trend={maxDrawdown}
          loading={isLoading}
        />
      </div>

      {/* Chart card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Portfolio vs Benchmarks</h2>
          </div>
          <DateRangePicker
            value={range}
            customStart={customStart}
            customEnd={customEnd}
            onChange={handleDateRangeChange}
          />
        </div>

        {/* Benchmark toggles */}
        <div className="flex flex-wrap gap-2 mb-5">
          {benchmarkButtons.map((b) => (
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
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: benchmarks[b.key] ? 'white' : b.color }}
              />
              {b.label}
            </button>
          ))}
        </div>

        <PerformanceChart
          data={performanceData}
          benchmarks={benchmarks}
          currency={currency}
          loading={isLoading}
        />
      </Card>
    </div>
  );
}
