import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupCapitalGains } from '../../hooks/useGroupReports';
import { useSettings } from '../../contexts/SettingsContext';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { GroupCapitalGain } from '../../types';

function getFinancialYears(type: 'jan-dec' | 'jul-jun') {
  const y = new Date().getFullYear();
  const years = [];
  for (let i = y; i >= y - 5; i--) {
    if (type === 'jan-dec') years.push({ label: `${i}`, value: `${i}` });
    else years.push({ label: `${i - 1}–${i}`, value: `${i}` });
  }
  return years;
}

export function GroupCapitalGainsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);
  const baseCurrency = group?.base_currency ?? 'AUD';
  const { financialYear: fyType } = useSettings();

  const currentYear = new Date().getFullYear();
  const [fyStart, setFyStart] = useState<'january' | 'july'>(fyType === 'jul-jun' ? 'july' : 'january');
  const [year, setYear]       = useState(String(currentYear));

  const years = getFinancialYears(fyStart === 'july' ? 'jul-jun' : 'jan-dec');

  const { data: gains = [], isLoading } = useGroupCapitalGains({ groupId: id, fyStart, year });

  const totalNet      = gains.reduce((s, g) => s + g.net_gain, 0);
  const totalDiscount = gains.reduce((s, g) => s + (g.cgt_discount_applicable ? g.gross_gain * ((g.cgt_discount_pct ?? 50) / 100) : 0), 0);
  const shortTerm     = gains.filter((g) => !g.is_long_term).reduce((s, g) => s + g.net_gain, 0);
  const longTerm      = gains.filter((g) => g.is_long_term).reduce((s, g) => s + g.net_gain, 0);

  const columns = [
    { key: 'portfolio_name', label: 'Portfolio',
      render: (v: unknown) => <span className="text-[13px] text-[var(--c-ink-mute)]">{String(v)}</span> },
    { key: 'symbol', label: 'Symbol', sortable: true,
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span> },
    { key: 'security_name', label: 'Security', render: (v: unknown) => String(v || '—') },
    { key: 'buy_date', label: 'Buy', sortable: true, render: (v: unknown) => formatDate(String(v), 'short') },
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
      render: (_v: unknown, row: GroupCapitalGain) => {
        const val = row.gross_gain;
        return <span style={{ color: getValueColor(val) }} className="font-medium">{formatCurrency(val, row.portfolio_currency)}</span>;
      },
    },
    { key: 'is_long_term', label: 'Type',
      render: (v: unknown) => <Badge variant={v ? 'success' : 'info'}>{v ? 'Long Term' : 'Short Term'}</Badge> },
    {
      key: 'net_gain',
      label: 'Net Gain',
      align: 'right' as const,
      sortable: true,
      render: (_v: unknown, row: GroupCapitalGain) => {
        const val = row.net_gain;
        return <span style={{ color: getValueColor(val) }} className="font-semibold">{formatCurrency(val, row.portfolio_currency)}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/groups/${id}`}
            className="flex items-center gap-1 text-[13px] text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] mb-2">
            <ArrowLeft size={13} /> {group?.name ?? 'Group'}
          </Link>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Capital Gains</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Consolidated CGT across all portfolios in this group</p>
        </div>
        <div className="flex gap-3">
          <Select
            label="FY Type"
            options={[
              { label: 'July – June (AU)', value: 'july' },
              { label: 'January – December', value: 'january' },
            ]}
            value={fyStart}
            onChange={(v) => {
              setFyStart(v as 'january' | 'july');
              setYear(String(new Date().getFullYear()));
            }}
            containerClassName="w-52"
          />
          <Select
            label="Year"
            options={years}
            value={year}
            onChange={setYear}
            containerClassName="w-36"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Short-Term Gains" value={formatCurrency(shortTerm, baseCurrency)} trend={shortTerm} />
        <StatCard label="Long-Term Gains"  value={formatCurrency(longTerm, baseCurrency)}  trend={longTerm}  />
        <StatCard label="CGT Discount"     value={formatCurrency(totalDiscount, baseCurrency)} />
        <StatCard label="Net Taxable Gain" value={formatCurrency(totalNet, baseCurrency)}  trend={totalNet}  />
      </div>

      <p className="text-[12px] text-[var(--c-ink-mute)]">
        Cost base and proceeds shown in each portfolio's native currency. Gain totals above are expressed in {baseCurrency} at current forex rates.
      </p>

      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <Table<GroupCapitalGain>
            columns={columns as Parameters<typeof Table<GroupCapitalGain>>[0]['columns']}
            data={gains}
            keyField="id"
            emptyMessage="No capital gain events in this period"
          />
        </Card>
      )}
    </div>
  );
}
