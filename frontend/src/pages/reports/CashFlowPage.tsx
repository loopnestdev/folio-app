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
import { Select } from '../../components/ui/Select';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { DateRange } from '../../types';

// ── Transaction classification ────────────────────────────────────────────────
type TxCategory = 'bank_transfer' | 'fx_transfer' | 'other';

function classifyTx(notes: string | null | undefined): TxCategory {
  const n = (notes ?? '').toLowerCase();
  if (n.includes('fx transfer')) return 'fx_transfer';
  if (n.includes('bank transfer')) return 'bank_transfer';
  return 'other';
}

function getTxAmount(t: any, isGroup: boolean): number {
  return isGroup ? (t.amount_base as number) : (t.price as number) * (t.quantity as number);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function CashFlowPage() {
  const { id } = useParams<{ id: string }>();
  const view = useReportViewSwitcher(id);
  const currency = view.currency;
  const isGroup = view.viewMode === 'group';

  const [range, setRange]             = useState<DateRange>('ALL');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd]     = useState<string>();
  const [filterCategory, setFilterCategory] = useState<TxCategory | 'all'>('all');

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

  const isLoading    = isGroup ? grpLoading  : indLoading;
  const result       = isGroup ? grpData     : indData;
  const transactions = result?.transactions ?? [];

  // ── Classify all transactions ──────────────────────────────────────────────
  const classified = transactions.map((t: any) => ({
    ...t,
    _category: classifyTx(t.notes),
    _amount:   getTxAmount(t, isGroup),
  }));

  // ── Summary buckets ────────────────────────────────────────────────────────
  const bankDeposits = classified
    .filter((t: any) => t.trade_type === 'deposit' && t._category === 'bank_transfer')
    .reduce((s: number, t: any) => s + t._amount, 0);

  const fxDeposits = classified
    .filter((t: any) => t.trade_type === 'deposit' && t._category === 'fx_transfer')
    .reduce((s: number, t: any) => s + t._amount, 0);

  const fxWithdrawals = classified
    .filter((t: any) => t.trade_type === 'withdrawal' && t._category === 'fx_transfer')
    .reduce((s: number, t: any) => s + t._amount, 0);

  const otherDeposits = classified
    .filter((t: any) => t.trade_type === 'deposit' && t._category === 'other')
    .reduce((s: number, t: any) => s + t._amount, 0);

  // ── Filtered rows for table ────────────────────────────────────────────────
  const visibleTx = filterCategory === 'all'
    ? classified
    : classified.filter((t: any) => t._category === filterCategory);

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
    {
      key: '_category',
      label: 'Category',
      render: (v: unknown) => {
        if (v === 'bank_transfer') return <span className="text-[13px] text-[var(--c-ink-mute)]">Bank Transfer</span>;
        if (v === 'fx_transfer')   return <span className="text-[13px] text-[var(--c-ink-mute)]">FX Transfer</span>;
        return <span className="text-[13px] text-[var(--c-ink-mute)]">Other</span>;
      },
    },
    // Portfolio column only in group view
    ...(isGroup ? [{
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
      key: '_amount',
      label: 'Amount',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown, row: any) => {
        const amt    = v as number;
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
      {/* Header */}
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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Bank Transfer Deposits"
          value={formatCurrency(bankDeposits, currency)}
          trend={bankDeposits}
          subtitle={otherDeposits > 0 ? `+${formatCurrency(otherDeposits, currency)} other` : undefined}
        />
        <StatCard
          label="FX Transfer Deposits"
          value={formatCurrency(fxDeposits, currency)}
          trend={fxDeposits}
        />
        <StatCard
          label="FX Transfer Withdrawals"
          value={formatCurrency(fxWithdrawals, currency)}
        />
      </div>

      {/* Transactions table */}
      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div>
              <CardHeader title="Transactions" subtitle={`${visibleTx.length} transaction${visibleTx.length !== 1 ? 's' : ''}`} />
            </div>
            <Select
              options={[
                { label: 'All categories', value: 'all' },
                { label: 'Bank Transfer',  value: 'bank_transfer' },
                { label: 'FX Transfer',    value: 'fx_transfer' },
                { label: 'Other',          value: 'other' },
              ]}
              value={filterCategory}
              onChange={(v) => setFilterCategory(v as TxCategory | 'all')}
              containerClassName="w-44"
            />
          </div>
          <Table
            columns={columns as any}
            data={visibleTx}
            keyField="id"
            emptyMessage="No transactions in this period"
          />
        </Card>
      )}
    </div>
  );
}
