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

/** Parse "USD → AUD" from notes like "FX Transfer (USD → AUD, rate 0.724…)" */
function extractFxDirection(notes: string | null | undefined): string | null {
  const m = (notes ?? '').match(/\(([A-Z]{3})\s*→\s*([A-Z]{3})/i);
  return m ? `${m[1].toUpperCase()} → ${m[2].toUpperCase()}` : null;
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
  const [filterCategory, setFilterCategory] = useState<string>('all');

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
  const classified = transactions.map((t: any) => {
    const _category = classifyTx(t.notes);
    return {
      ...t,
      _category,
      _amount:      getTxAmount(t, isGroup),
      _fxDirection: _category === 'fx_transfer' ? extractFxDirection(t.notes) : null,
    };
  });

  // ── Summary buckets ────────────────────────────────────────────────────────
  const bankDepositsOnly = classified
    .filter((t: any) => t.trade_type === 'deposit' && t._category === 'bank_transfer')
    .reduce((s: number, t: any) => s + t._amount, 0);

  const otherDeposits = classified
    .filter((t: any) => t.trade_type === 'deposit' && t._category === 'other')
    .reduce((s: number, t: any) => s + t._amount, 0);

  // Combined: "Bank Transfer" + "Other" deposits are both cash inflows from your bank
  const bankDeposits = bankDepositsOnly + otherDeposits;

  const bankWithdrawalsOnly = classified
    .filter((t: any) => t.trade_type === 'withdrawal' && t._category === 'bank_transfer')
    .reduce((s: number, t: any) => s + t._amount, 0);

  const otherWithdrawals = classified
    .filter((t: any) => t.trade_type === 'withdrawal' && t._category === 'other')
    .reduce((s: number, t: any) => s + t._amount, 0);

  // Combined: "Bank Transfer" + "Other" withdrawals are both cash outflows to your bank
  const bankWithdrawals = bankWithdrawalsOnly + otherWithdrawals;

  // FX: unique directions found in the data, sorted for stable card order
  const fxDirections = [...new Set(
    classified
      .filter((t: any) => t._category === 'fx_transfer' && t._fxDirection)
      .map((t: any) => t._fxDirection as string),
  )].sort();

  // For each direction sum the arrival side — that's what arrived in the destination currency.
  // Newly-imported FX transfers use trade_type 'fx_transfer_in'; older rows recorded before
  // that type existed still use 'deposit' (with "FX Transfer" in the notes) — match both.
  const fxDepositsByDirection: Record<string, number> = Object.fromEntries(
    fxDirections.map((dir) => [
      dir,
      classified
        .filter((t: any) => t._category === 'fx_transfer' && (t.trade_type === 'deposit' || t.trade_type === 'fx_transfer_in') && t._fxDirection === dir)
        .reduce((s: number, t: any) => s + t._amount, 0),
    ]),
  );

  // ── Filtered rows for table ────────────────────────────────────────────────
  const visibleTx = filterCategory === 'all'
    ? classified
    : filterCategory.startsWith('fx:')
      ? classified.filter((t: any) => t._fxDirection === filterCategory.slice(3))
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
        <Badge variant={v === 'deposit' || v === 'fx_transfer_in' ? 'success' : 'warning'}>
          {String(v).toUpperCase()}
        </Badge>
      ),
    },
    {
      key: '_category',
      label: 'Category',
      render: (v: unknown, row: any) => {
        if (v === 'bank_transfer')
          return <span className="text-[13px] text-[var(--c-ink-mute)]">Bank Transfer</span>;
        if (v === 'fx_transfer' && row._fxDirection)
          return <span className="text-[13px] text-[var(--c-ink-mute)]">FX ({row._fxDirection})</span>;
        if (v === 'fx_transfer')
          return <span className="text-[13px] text-[var(--c-ink-mute)]">FX Transfer</span>;
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
        const signed = (row.trade_type === 'withdrawal' || row.trade_type === 'fx_transfer_out') ? -amt : amt;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Bank Transfer Deposits"
          value={formatCurrency(bankDeposits, currency)}
          trend={bankDeposits}
          tooltip="Total cash deposited from your bank — includes labelled bank transfers and other direct deposits (e.g. Zepto payments)"
        />
        <StatCard
          label="Bank Transfer Withdrawals"
          value={formatCurrency(bankWithdrawals, currency)}
          trend={-bankWithdrawals}
          tooltip="Total cash withdrawn to your bank — includes labelled bank transfers and other direct withdrawals"
        />
        {fxDirections.map((dir) => {
          const [from, to] = dir.split(' → ');
          return (
            <StatCard
              key={dir}
              label={`FX Transfer (${dir})`}
              value={formatCurrency(fxDepositsByDirection[dir] ?? 0, currency)}
              trend={fxDepositsByDirection[dir] ?? 0}
              tooltip={`${from} converted to ${to} — total ${to} received across all conversions in this direction (deposit side, shown in base currency)`}
            />
          );
        })}
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
                ...fxDirections.map((dir) => ({ label: `FX (${dir})`, value: `fx:${dir}` })),
                { label: 'Other',          value: 'other' },
              ]}
              value={filterCategory}
              onChange={(v) => setFilterCategory(v)}
              containerClassName="w-52"
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
