import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCashFlows } from '../../hooks/useReports';
import { useGroupCashFlows } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Card, CardHeader } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { DateRange } from '../../types';

export function CashFlowPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);
  const currency = view.currency;

  const [range, setRange]             = useState<DateRange>('ALL');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd]     = useState<string>();

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const { data: indData, isLoading: indLoading } = useCashFlows({
    portfolioId: view.portfolioId, range, customStart, customEnd,
  });
  const { data: grpData, isLoading: grpLoading } = useGroupCashFlows({
    groupId: view.groupId, range, customStart, customEnd,
  });

  const isLoading   = view.viewMode === 'group' ? grpLoading  : indLoading;
  const result      = view.viewMode === 'group' ? grpData     : indData;
  const transactions = result?.transactions ?? [];
  const summary      = result?.summary ?? { total_deposited: 0, total_withdrawn: 0, net_deposited: 0 };

  const columns = [
    {
      key: 'trade_date',
      label: 'Date',
      sortable: true,
      render: (v: unknown) => formatDate(String(v), 'medium'),
    },
    {
      key: 'trade_type',
      label: 'Type',
      render: (v: unknown) => (
        <Badge variant={v === 'deposit' ? 'success' : 'warning'}>
          {String(v).toUpperCase()}
        </Badge>
      ),
    },
    // Show portfolio name in group view
    ...(view.viewMode === 'group' ? [{
      key: 'portfolio_name' as string,
      label: 'Portfolio',
      render: (v: unknown) => <span className="text-[var(--c-ink-mute)]">{String(v ?? '—')}</span>,
    }] : []),
    {
      key: 'notes',
      label: 'Notes',
      render: (v: unknown) => (
        <span className="text-[var(--c-ink-mute)] text-[13px]">{String(v ?? '—')}</span>
      ),
    },
    {
      key: 'price',
      label: 'Amount',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown, row: any) => {
        // In group view use amount_base (already FX-converted); otherwise native amount
        const amt = view.viewMode === 'group'
          ? (row.amount_base as number)
          : (v as number) * (row.quantity as number);
        const signed = row.trade_type === 'withdrawal' ? -amt : amt;
        return (
          <span style={{ color: getValueColor(signed) }} className="font-medium">
            {formatCurrency(amt, currency)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Cash Flows</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            Deposits and withdrawals{view.displayName ? ` · ${view.displayName}` : ''}
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

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Deposited"
          value={formatCurrency(summary.total_deposited, currency)}
          trend={summary.total_deposited}
        />
        <StatCard
          label="Total Withdrawn"
          value={formatCurrency(summary.total_withdrawn, currency)}
        />
        <StatCard
          label="Net Deposited"
          value={formatCurrency(summary.net_deposited, currency)}
          trend={summary.net_deposited}
        />
      </div>

      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <CardHeader
            title="Transactions"
            subtitle={`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
          />
          <Table
            columns={columns as any}
            data={transactions}
            keyField="id"
            emptyMessage="No deposits or withdrawals in this period"
          />
        </Card>
      )}
    </div>
  );
}
