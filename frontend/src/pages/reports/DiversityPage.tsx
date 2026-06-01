import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDiversity } from '../../hooks/useReports';
import { useGroupDiversity } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
import { Card, CardHeader } from '../../components/ui/Card';
import { DiversityChart } from '../../components/charts/DiversityChart';
import { Table } from '../../components/ui/Table';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatPercent, CHART_COLORS } from '../../lib/utils';
import type { DiversityAllocation } from '../../types';

export function DiversityPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);

  const { data: indDiversity, isLoading: indLoading } = useDiversity({ portfolioId: view.portfolioId });
  const { data: grpDiversity, isLoading: grpLoading } = useGroupDiversity({ groupId: view.groupId });
  const diversity = view.viewMode === 'group' ? grpDiversity : indDiversity;
  const isLoading = view.viewMode === 'group' ? grpLoading : indLoading;

  const [activeTab, setActiveTab] = useState<'sector' | 'type' | 'country' | 'market'>('sector');

  const tabData: Record<string, DiversityAllocation[]> = {
    sector: diversity?.by_sector ?? [],
    type: diversity?.by_investment_type ?? [],
    country: diversity?.by_country ?? [],
    market: diversity?.by_market ?? [],
  };

  const currentData = tabData[activeTab].map((d, i) => ({
    ...d,
    color: d.color || CHART_COLORS[i % CHART_COLORS.length],
  }));

  const tabs = [
    { key: 'sector', label: 'Sector' },
    { key: 'type', label: 'Type' },
    { key: 'country', label: 'Country' },
    { key: 'market', label: 'Market' },
  ];

  const allocationColumns = [
    {
      key: 'name',
      label: 'Category',
      render: (v: unknown, row: DiversityAllocation & { color?: string }) => (
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: row.color || '#ccc' }}
          />
          <span>{String(v)}</span>
        </div>
      ),
    },
    {
      key: 'value',
      label: 'Value',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    },
    {
      key: 'pct',
      label: 'Allocation %',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => (
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 bg-[var(--c-border)] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-[var(--c-primary)]"
              style={{ width: `${Math.min(Number(v), 100)}%` }}
            />
          </div>
          <span className="w-12 text-right">{formatPercent(Number(v), 1)}</span>
        </div>
      ),
    },
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Portfolio Diversity</h1>
            <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Allocation breakdown across sectors, types, and geographies{view.displayName ? ` · ${view.displayName}` : ''}</p>
          </div>
          {view.hasGroups && (
            <ReportViewSwitcher
              viewMode={view.viewMode} portfolios={view.portfolios} groups={view.groups}
              activePortfolioId={view.activePortfolioId} activeGroupId={view.activeGroupId}
              onViewModeChange={view.onViewModeChange} onPortfolioChange={view.onPortfolioChange} onGroupChange={view.onGroupChange}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center bg-[var(--c-canvas-soft)] rounded-full p-1 gap-0.5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-1.5 rounded-full text-[14px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
                : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <Card>
          <CardHeader title={tabs.find((t) => t.key === activeTab)?.label || ''} subtitle="Portfolio allocation" />
          <DiversityChart data={currentData} />
        </Card>

        {/* Table */}
        <Card padding="none">
          <div className="px-6 pt-5 pb-4">
            <h2 className="text-[19px] font-semibold text-[var(--c-ink)]">Breakdown</h2>
          </div>
          <Table<DiversityAllocation & { color?: string }>
            columns={allocationColumns as Parameters<typeof Table<DiversityAllocation & { color?: string }>>[0]['columns']}
            data={currentData}
            emptyMessage="No data available"
          />
        </Card>
      </div>
    </div>
  );
}
