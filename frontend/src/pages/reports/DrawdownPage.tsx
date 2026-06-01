import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useDrawdown } from '../../hooks/useReports';
import { Card, CardHeader } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { DrawdownChart } from '../../components/charts/DrawdownChart';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatPercent } from '../../lib/utils';
import type { DateRange } from '../../types';

export function DrawdownPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;

  const [range, setRange] = useState<DateRange>('1Y');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd] = useState<string>();

  const { data: drawdownData = [], isLoading } = useDrawdown({
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

  const maxDrawdown = Math.min(...drawdownData.map((d) => d.drawdown), 0);
  const avgDrawdown =
    drawdownData.length > 0
      ? drawdownData.reduce((s, d) => s + d.drawdown, 0) / drawdownData.length
      : 0;
  const daysInDrawdown = drawdownData.filter((d) => d.drawdown < 0).length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Drawdown Analysis</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Rolling maximum drawdown from peak{activePortfolio?.name ? ` · ${activePortfolio.name}` : ''}</p>
        </div>
        <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />
      </div>

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
