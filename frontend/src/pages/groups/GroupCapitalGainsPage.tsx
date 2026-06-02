import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupCapitalGains } from '../../hooks/useGroupReports';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { GroupCapitalGain, DateRange } from '../../types';

export function GroupCapitalGainsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);
  const baseCurrency = group?.base_currency ?? 'AUD';

  const [range, setRange]             = useState<DateRange>('ALL');
  const [customStart, setCustomStart] = useState<string>();
  const [customEnd, setCustomEnd]     = useState<string>();

  const handleRangeChange = (r: DateRange, start?: string, end?: string) => {
    setRange(r);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const { data: gains = [], isLoading } = useGroupCapitalGains({
    groupId: id, range, customStart, customEnd,
  });

  const totalNet      = gains.reduce((s, g) => s + (g.net_gain_base   ?? g.net_gain),   0);
  const totalDiscount = gains.reduce((s, g) => s + (g.cgt_discount_applicable
    ? (g.gross_gain_base ?? g.gross_gain) * ((g.cgt_discount_pct ?? 50) / 100)
    : 0), 0);
  const shortTerm = gains.filter((g) => !g.is_long_term).reduce((s, g) => s + (g.net_gain_base ?? g.net_gain), 0);
  const longTerm  = gains.filter((g) =>  g.is_long_term).reduce((s, g) => s + (g.net_gain_base ?? g.net_gain), 0);

  const columns = [
    { key: 'portfolio_name', label: 'Portfolio',
      render: (v: unknown) => <span className="text-[13px] text-[var(--c-ink-mute)]">{String(v)}</span> },
    { key: 'symbol', label: 'Symbol', sortable: true,
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    { key: 'buy_date',  label: 'Buy',  sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
    { key: 'sell_date', label: 'Sell', sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
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
      render: (_v: unknown, row: GroupCapitalGain) => formatCurrency(row.cost_base, row.portfolio_currency) },
    { key: 'proceeds', label: 'Proceeds', align: 'right' as const,
      render: (_v: unknown, row: GroupCapitalGain) => formatCurrency(row.proceeds, row.portfolio_currency) },
    {
      key: 'gross_gain',
      label: 'Gross Gain',
      align: 'right' as const,
      sortable: true,
      render: (_v: unknown, row: GroupCapitalGain) => (
        <span style={{ color: getValueColor(row.gross_gain) }} className="font-medium">
          {formatCurrency(row.gross_gain, row.portfolio_currency)}
        </span>
      ),
    },
    { key: 'is_long_term', label: 'Type',
      render: (v: unknown) => <Badge variant={v ? 'success' : 'info'}>{v ? 'Long Term' : 'Short Term'}</Badge> },
    {
      key: 'net_gain',
      label: 'Net Gain',
      align: 'right' as const,
      sortable: true,
      render: (_v: unknown, row: GroupCapitalGain) => (
        <span style={{ color: getValueColor(row.net_gain) }} className="font-semibold">
          {formatCurrency(row.net_gain, row.portfolio_currency)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/groups/${id}`}
          className="flex items-center gap-1 text-[13px] text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] mb-2">
          <ArrowLeft size={13} /> {group?.name ?? 'Group'}
        </Link>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Capital Gains</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
          Consolidated realised gains across all portfolios in this group
        </p>
      </div>

      <DateRangePicker value={range} customStart={customStart} customEnd={customEnd} onChange={handleRangeChange} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Short-Term Gains" value={formatCurrency(shortTerm,      baseCurrency)} trend={shortTerm} />
        <StatCard label="Long-Term Gains"  value={formatCurrency(longTerm,       baseCurrency)} trend={longTerm} />
        <StatCard label="CGT Discount"     value={formatCurrency(totalDiscount,  baseCurrency)} />
        <StatCard label="Net Taxable Gain" value={formatCurrency(totalNet,       baseCurrency)} trend={totalNet} />
      </div>

      <p className="text-[12px] text-[var(--c-ink-mute)]">
        Cost base and proceeds are shown in each portfolio's native currency.
        Gain totals above are converted to {baseCurrency} at the forex rate on each disposal date (ATO-compliant).
      </p>

      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <Table<GroupCapitalGain>
            columns={columns as Parameters<typeof Table<GroupCapitalGain>>[0]['columns']}
            data={gains}
            keyField="id"
            emptyMessage="No realised gains in this period"
          />
        </Card>
      )}
    </div>
  );
}
