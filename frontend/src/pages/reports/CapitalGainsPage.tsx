import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useCapitalGains } from '../../hooks/useReports';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, getValueColor } from '../../lib/utils';
import type { CapitalGain } from '../../types';

function getFinancialYears(type: 'jan-dec' | 'jul-jun') {
  const y = new Date().getFullYear();
  const years = [];
  for (let i = y; i >= y - 5; i--) {
    if (type === 'jan-dec') years.push({ label: `${i}`, value: `${i}` });
    else years.push({ label: `${i - 1}–${i}`, value: `${i}` });
  }
  return years;
}

export function CapitalGainsPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';
  const { financialYear: fyType } = useSettings();

  const currentYear = new Date().getFullYear();
  const [fyStart, setFyStart] = useState<'january' | 'july'>(fyType === 'jul-jun' ? 'july' : 'january');
  const [year, setYear]       = useState(String(currentYear));

  const years = getFinancialYears(fyStart === 'july' ? 'jul-jun' : 'jan-dec');

  const { data: gains = [], isLoading } = useCapitalGains({ portfolioId, fyStart, year });

  const totalNet      = gains.reduce((s, g) => s + g.net_gain, 0);
  const totalDiscount = gains.reduce((s, g) => s + (g.cgt_discount_applicable ? g.gross_gain * (g.cgt_discount_pct / 100) : 0), 0);
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Capital Gains</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">CGT report for sold positions{activePortfolio?.name ? ` · ${activePortfolio.name}` : ''}</p>
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

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Short-Term Gains" value={formatCurrency(shortTermGains, currency)} />
        <StatCard label="Long-Term Gains"  value={formatCurrency(longTermGains, currency)} />
        <StatCard label="CGT Discount"     value={formatCurrency(totalDiscount, currency)} />
        <StatCard label="Net Taxable Gain" value={formatCurrency(totalNet, currency)} />
      </div>

      {/* Table */}
      {isLoading ? <PageLoader /> : (
        <Card padding="none">
          <Table<CapitalGain>
            columns={columns as Parameters<typeof Table<CapitalGain>>[0]['columns']}
            data={gains}
            keyField="id"
            emptyMessage="No capital gains in this period"
          />
        </Card>
      )}
    </div>
  );
}
