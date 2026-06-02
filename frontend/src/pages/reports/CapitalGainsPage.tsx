import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCapitalGains } from '../../hooks/useReports';
import { useGroupCapitalGains } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { CapitalGain, DateRange } from '../../types';

export function CapitalGainsPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);
  const currency = view.currency;

  const [range, setRange]           = useState<DateRange>('ALL');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd]     = useState<string>();

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const { data: indGains = [], isLoading: indLoading } = useCapitalGains({
    portfolioId: view.portfolioId, range, customStart, customEnd,
  });
  const { data: grpRaw = [], isLoading: grpLoading } = useGroupCapitalGains({
    groupId: view.groupId, range, customStart, customEnd,
  });

  // GroupCapitalGain has net_gain_base (in base currency); map to same shape for display
  const grpGains = grpRaw.map((g) => ({
    ...g,
    net_gain:   g.net_gain_base   ?? g.net_gain,
    gross_gain: g.gross_gain_base ?? g.gross_gain,
  }));

  const gains     = view.viewMode === 'group' ? grpGains : indGains;
  const isLoading = view.viewMode === 'group' ? grpLoading : indLoading;

  const totalNet       = gains.reduce((s, g) => s + g.net_gain, 0);
  const totalDiscount  = gains.reduce((s, g) => s + (g.cgt_discount_applicable ? g.gross_gain * (g.cgt_discount_pct / 100) : 0), 0);
  const shortTermGains = gains.filter((g) => !g.is_long_term).reduce((s, g) => s + g.net_gain, 0);
  const longTermGains  = gains.filter((g) =>  g.is_long_term).reduce((s, g) => s + g.net_gain, 0);

  const columns = [
    { key: 'symbol', label: 'Symbol', sortable: true,
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    { key: 'buy_date',  label: 'Buy Date',  sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
    { key: 'sell_date', label: 'Sell Date', sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
    {
      key: 'hold_period_days',
      label: 'Held',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const d = Number(v);
        return d >= 365 ? `${Math.floor(d / 365)}y ${Math.floor((d % 365) / 30)}m` : `${d}d`;
      },
    },
    { key: 'quantity', label: 'Qty', align: 'right' as const,
      render: (v: unknown) => Number(v).toLocaleString() },
    { key: 'cost_base', label: 'Cost Base', align: 'right' as const,
      render: (v: unknown) => formatCurrency(Number(v), currency) },
    { key: 'proceeds', label: 'Proceeds', align: 'right' as const,
      render: (v: unknown) => formatCurrency(Number(v), currency) },
    {
      key: 'gross_gain',
      label: 'Gross Gain',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const val = Number(v);
        return <span style={{ color: getValueColor(val) }} className="font-medium">{formatCurrency(val, currency)}</span>;
      },
    },
    { key: 'is_long_term', label: 'Type',
      render: (v: unknown) => <Badge variant={v ? 'success' : 'info'}>{v ? 'Long Term' : 'Short Term'}</Badge> },
    {
      key: 'net_gain',
      label: 'Net Gain',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => {
        const val = Number(v);
        return <span style={{ color: getValueColor(val) }} className="font-semibold">{formatCurrency(val, currency)}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Capital Gains</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            Realised gains from sold positions{view.displayName ? ` · ${view.displayName}` : ''}
          </p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Short-Term Gains" value={formatCurrency(shortTermGains, currency)} trend={shortTermGains} />
        <StatCard label="Long-Term Gains"  value={formatCurrency(longTermGains,  currency)} trend={longTermGains} />
        <StatCard label="CGT Discount"     value={formatCurrency(totalDiscount,  currency)} />
        <StatCard label="Net Taxable Gain" value={formatCurrency(totalNet,       currency)} trend={totalNet} />
      </div>

      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <Table<CapitalGain>
            columns={columns as Parameters<typeof Table<CapitalGain>>[0]['columns']}
            data={gains}
            keyField="id"
            emptyMessage="No realised gains in this period"
          />
        </Card>
      )}
    </div>
  );
}
