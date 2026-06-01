import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDrawdown } from '../../hooks/useReports';
import { useGroupDrawdown } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
import { Card, CardHeader } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { DrawdownChart } from '../../components/charts/DrawdownChart';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatPercent } from '../../lib/utils';
import type { DateRange } from '../../types';

export function DrawdownPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();

  const { data: indData = [], isLoading: indLoading } = useDrawdown({ portfolioId: view.portfolioId, range, customStart, customEnd });
  const { data: grpData = [], isLoading: grpLoading } = useGroupDrawdown({ groupId: view.groupId, range, customStart, customEnd });
  const drawdownData = view.viewMode === 'group' ? grpData : indData;
  const isLoading    = view.viewMode === 'group' ? grpLoading : indLoading;

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const maxDrawdown = Math.min(...drawdownData.map((d) => d.drawdown), 0);
  const avgDrawdown =
    drawdownData.length > 0
      ? drawdownData.reduce((s, d) => s + d.drawdown, 0) / drawdownData.length
      : 0;
  const daysInDrawdown = drawdownData.filter((d) => d.drawdown < 0).length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Drawdown Analysis</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Rolling maximum drawdown from peak{view.displayName ? ` · ${view.displayName}` : ''}</p>
        </div>
        {view.hasGroups && (
          <ReportViewSwitcher
            viewMode={view.viewMode} portfolios={view.portfolios} groups={view.groups}
            activePortfolioId={view.activePortfolioId} activeGroupId={view.activeGroupId}
            onViewModeChange={view.onViewModeChange} onPortfolioChange={view.onPortfolioChange} onGroupChange={view.onGroupChange}
          />
        )}
      </div>
      <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Max Drawdown"
          value={formatPercent(maxDrawdown)}
          trend={maxDrawdown}
        />
        <StatCard
          label="Avg Drawdown"
          value={formatPercent(avgDrawdown)}
          trend={avgDrawdown}
        />
        <StatCard
          label="Days in Drawdown"
          value={`${daysInDrawdown}`}
          subtitle={`of ${drawdownData.length} total days`}
        />
      </div>

      <Card>
        <CardHeader title="Drawdown Chart" subtitle="Percentage decline from rolling peak" />
        <DrawdownChart data={drawdownData} />
      </Card>
    </div>
  );
}
