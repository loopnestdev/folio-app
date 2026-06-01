import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useStatistics } from '../../hooks/useStatistics';
import { useGroupStatistics } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { Card, CardHeader } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatPercent } from '../../lib/utils';
import type { DateRange } from '../../types';

interface StatRowProps {
  label: string;
  value: string;
  description?: string;
  positive?: boolean;
}

function StatRow({ label, value, description, positive }: StatRowProps) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--c-border)] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-[15px] text-[var(--c-ink)]">{label}</span>
        {description && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]"
              aria-label="More info"
            >
              <Info size={15} />
            </button>
            {showTip && (
              <div className="absolute left-0 bottom-full mb-2 w-64 bg-[var(--c-ink)] text-white text-[13px] rounded-xl p-3 z-10 shadow-lg">
                {description}
              </div>
            )}
          </div>
        )}
      </div>
      <span
        className="text-[17px] font-semibold"
        style={{
          color:
            positive === undefined
              ? 'var(--c-ink)'
              : positive
                ? 'var(--c-bull)'
                : 'var(--c-bear)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function StatisticsPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();

  const { data: indStats, isLoading: indLoading } = useStatistics({ portfolioId: view.portfolioId, range, customStart, customEnd });
  const { data: grpStats, isLoading: grpLoading } = useGroupStatistics({ groupId: view.groupId, range, customStart, customEnd });
  const stats     = view.viewMode === 'group' ? grpStats : indStats;
  const isLoading = view.viewMode === 'group' ? grpLoading : indLoading;

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Statistics</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Risk and return metrics{view.displayName ? ` · ${view.displayName}` : ''}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {view.hasGroups && (
            <ReportViewSwitcher
              viewMode={view.viewMode} portfolios={view.portfolios} groups={view.groups}
              activePortfolioId={view.activePortfolioId} activeGroupId={view.activeGroupId}
              onViewModeChange={view.onViewModeChange} onPortfolioChange={view.onPortfolioChange} onGroupChange={view.onGroupChange}
            />
          )}
          <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />
        </div>
      </div>

      {!stats ? (
        <Card>
          <p className="text-[15px] text-[var(--c-ink-mute)] text-center py-12">No data available for the selected period.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Return Metrics */}
          <Card>
            <CardHeader title="Return Metrics" />
            <div>
              <StatRow
                label="Total Return Annualized"
                value={formatPercent(stats.total_return_annualized)}
                description="Annualized compounded return (CAGR) over the selected period."
                positive={stats.total_return_annualized >= 0}
              />
              <StatRow
                label="Winning Months"
                value={formatPercent(stats.winning_months_pct, 1)}
                description="Percentage of months with a positive return."
                positive={stats.winning_months_pct >= 50}
              />
              <StatRow
                label="Max Drawdown (Monthly)"
                value={formatPercent(stats.max_drawdown ?? 0)}
                description="Largest peak-to-trough decline based on monthly returns."
                positive={(stats.max_drawdown ?? 0) >= 0}
              />
              <StatRow
                label="Std Dev (Monthly)"
                value={formatPercent(stats.std_dev_monthly)}
                description="Standard deviation of monthly returns — a measure of volatility."
              />
            </div>
          </Card>

          {/* Risk Metrics */}
          <Card>
            <CardHeader title="Risk Metrics" />
            <div>
              <StatRow
                label="Sharpe Ratio"
                value={(stats.sharpe_ratio ?? 0).toFixed(2)}
                description="Return per unit of risk (vs risk-free rate). Higher is better."
                positive={(stats.sharpe_ratio ?? 0) >= 1}
              />
              <StatRow
                label="Sortino Ratio"
                value={(stats.sortino_ratio ?? 0).toFixed(2)}
                description="Return per unit of downside risk. Penalizes only negative volatility."
                positive={(stats.sortino_ratio ?? 0) >= 1}
              />
              <StatRow
                label="Beta (vs ASX 200)"
                value={(stats.beta ?? 0).toFixed(2)}
                description="Sensitivity to market movements. Beta > 1 means more volatile than the market."
              />
              <StatRow
                label="Correlation vs S&P 500"
                value={(stats.correlation_sp500 ?? 0).toFixed(2)}
                description="Correlation with S&P 500. 1 = perfectly correlated, 0 = uncorrelated."
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
