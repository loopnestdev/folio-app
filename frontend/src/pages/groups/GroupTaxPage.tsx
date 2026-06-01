import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGroups } from '../../hooks/useGroups';
import { useGroupTax } from '../../hooks/useGroupReports';
import { useSettings } from '../../contexts/SettingsContext';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency, getValueColor } from '../../lib/utils';
import type { GroupPortfolioTax } from '../../types';

function getFinancialYears(type: 'jan-dec' | 'jul-jun') {
  const y = new Date().getFullYear();
  const years = [];
  for (let i = y; i >= y - 5; i--) {
    if (type === 'jan-dec') years.push({ label: `${i}`, value: `${i}` });
    else years.push({ label: `${i - 1}–${i}`, value: `${i}` });
  }
  return years;
}

export function GroupTaxPage() {
  const { id } = useParams<{ id: string }>();
  const { data: groups = [] } = useGroups();
  const group = groups.find((g) => g.id === id);
  const baseCurrency = group?.base_currency ?? 'AUD';
  const { financialYear: fyType } = useSettings();

  const currentYear = new Date().getFullYear();
  const [fyStart, setFyStart] = useState<'january' | 'july'>(fyType === 'jul-jun' ? 'july' : 'january');
  const [year, setYear]       = useState(String(currentYear));

  const years = getFinancialYears(fyStart === 'july' ? 'jul-jun' : 'jan-dec');

  const { data: taxData, isLoading } = useGroupTax({ groupId: id, fyStart, year });

  const taxRows = [
    { label: 'Dividend income',           value: taxData?.dividends_received ?? 0 },
    { label: 'Interest income',           value: taxData?.interest_received ?? 0 },
    { label: 'Short-term capital gains',  value: taxData?.capital_gains_short_term ?? 0 },
    { label: 'Long-term capital gains',   value: taxData?.capital_gains_long_term ?? 0 },
    { label: 'Less: CGT discount (50%)',  value: -(taxData?.cgt_discount_applied ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/groups/${id}`}
            className="flex items-center gap-1 text-[13px] text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] mb-2">
            <ArrowLeft size={13} /> {group?.name ?? 'Group'}
          </Link>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Group Tax Report</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            Consolidated income and CGT across all portfolios · {baseCurrency}
          </p>
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

      {isLoading ? <PageLoader /> : !taxData ? (
        <Card>
          <p className="text-center text-[15px] text-[var(--c-ink-mute)] py-12">No tax data for this period.</p>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Dividends" value={formatCurrency(taxData.dividends_received, baseCurrency)} />
            <StatCard label="Interest"  value={formatCurrency(taxData.interest_received, baseCurrency)} />
            <StatCard label="Capital Gains (Short)"
              value={formatCurrency(taxData.capital_gains_short_term, baseCurrency)} />
            <StatCard label="Capital Gains (Long)"
              value={formatCurrency(taxData.capital_gains_long_term, baseCurrency)} />
            <StatCard label="CGT Discount" value={formatCurrency(taxData.cgt_discount_applied, baseCurrency)} />
            <StatCard label="Total Taxable Income"
              value={formatCurrency(taxData.total_taxable_income, baseCurrency)} />
          </div>

          {/* Consolidated waterfall */}
          <Card>
            <CardHeader title={`Tax Summary — ${taxData.financial_year}`} subtitle={`All values in ${baseCurrency}`} />
            <div className="space-y-0">
              {taxRows.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-3 border-b border-[var(--c-border)] last:border-0">
                  <span className="text-[15px] text-[var(--c-ink)]">{label}</span>
                  <span className="text-[15px] font-medium" style={{ color: value < 0 ? 'var(--c-bull)' : 'var(--c-ink)' }}>
                    {value < 0 ? '(' : ''}{formatCurrency(Math.abs(value), baseCurrency)}{value < 0 ? ')' : ''}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-4 border-t-2 border-[var(--c-border)]">
                <span className="text-[17px] font-semibold text-[var(--c-ink)]">Total taxable income</span>
                <span className="text-[17px] font-semibold" style={{ color: getValueColor(taxData.total_taxable_income) }}>
                  {formatCurrency(taxData.total_taxable_income, baseCurrency)}
                </span>
              </div>
            </div>
          </Card>

          {/* Per-portfolio breakdown */}
          {taxData.portfolios.length > 1 && (
            <Card>
              <CardHeader
                title="By Portfolio"
                subtitle={`Converted to ${baseCurrency} at current forex rates`}
              />
              <div className="space-y-4 mt-2">
                {taxData.portfolios.map((p: GroupPortfolioTax) => (
                  <div key={p.portfolio_id} className="rounded-xl border border-[var(--c-border)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[15px] font-semibold text-[var(--c-ink)]">{p.portfolio_name}</p>
                        <p className="text-[12px] text-[var(--c-ink-mute)]">
                          {p.portfolio_currency}
                          {p.portfolio_currency !== baseCurrency && ` · FX ${p.fx_rate.toFixed(4)} → ${baseCurrency}`}
                        </p>
                      </div>
                      <p className="text-[17px] font-semibold" style={{ color: getValueColor(p.total_taxable_income) }}>
                        {formatCurrency(p.total_taxable_income, baseCurrency)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]">
                      {[
                        { label: 'Dividends', value: p.dividends_received },
                        { label: 'Interest', value: p.interest_received },
                        { label: 'Short-term CGT', value: p.capital_gains_short_term },
                        { label: 'Long-term CGT', value: p.capital_gains_long_term },
                        { label: 'CGT Discount', value: -p.cgt_discount_applied },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[var(--c-ink-mute)]">{label}</p>
                          <p className="font-medium text-[var(--c-ink)]">
                            {value < 0 ? '(' : ''}{formatCurrency(Math.abs(value), baseCurrency)}{value < 0 ? ')' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
