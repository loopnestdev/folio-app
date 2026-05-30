import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useTaxReport } from '../../hooks/useReports';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { StatCard } from '../../components/ui/StatCard';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';

function getFinancialYears(type: 'jan-dec' | 'jul-jun'): { label: string; value: string }[] {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    if (type === 'jan-dec') {
      years.push({ label: `${y}`, value: `${y}` });
    } else {
      years.push({ label: `${y - 1}–${y}`, value: `${y - 1}-${y}` });
    }
  }
  return years;
}

export function TaxPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id;
  const currency = activePortfolio?.currency || 'USD';
  const { financialYear: fyType } = useSettings();

  const currentYear = new Date().getFullYear();
  const defaultYear =
    fyType === 'jan-dec'
      ? String(currentYear)
      : `${currentYear - 1}-${currentYear}`;

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [yearType, setYearType] = useState<'jan-dec' | 'jul-jun'>(fyType);

  const years = getFinancialYears(yearType);

  const { data: taxData, isLoading } = useTaxReport({
    portfolioId,
    financialYear: selectedYear,
    yearType,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Tax Report</h1>
        <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Income and capital gains for tax purposes</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          label="Financial Year Type"
          options={[
            { label: 'January – December', value: 'jan-dec' },
            { label: 'July – June (Australian)', value: 'jul-jun' },
          ]}
          value={yearType}
          onChange={(v) => {
            setYearType(v as 'jan-dec' | 'jul-jun');
            const newYears = getFinancialYears(v as 'jan-dec' | 'jul-jun');
            setSelectedYear(newYears[0].value);
          }}
          containerClassName="w-72"
        />
        <Select
          label="Year"
          options={years}
          value={selectedYear}
          onChange={setSelectedYear}
          containerClassName="w-44"
        />
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !taxData ? (
        <Card>
          <p className="text-[15px] text-[var(--c-ink-mute)] text-center py-12">
            No tax data available for the selected period.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Dividends Received"
              value={formatCurrency(taxData.dividends_received, currency)}
            />
            <StatCard
              label="Interest Received"
              value={formatCurrency(taxData.interest_received, currency)}
            />
            <StatCard
              label="Capital Gains (Short Term)"
              value={formatCurrency(taxData.capital_gains_short_term, currency)}
              trend={taxData.capital_gains_short_term}
            />
            <StatCard
              label="Capital Gains (Long Term)"
              value={formatCurrency(taxData.capital_gains_long_term, currency)}
              trend={taxData.capital_gains_long_term}
            />
            <StatCard
              label="CGT Discount Applied"
              value={formatCurrency(taxData.cgt_discount_applied, currency)}
            />
            <StatCard
              label="Total Taxable Income"
              value={formatCurrency(taxData.total_taxable_income, currency)}
              trend={taxData.total_taxable_income}
            />
          </div>

          {/* Details */}
          <Card>
            <CardHeader title={`Tax Summary — ${taxData.financial_year}`} />
            <div className="space-y-3">
              {[
                { label: 'Dividend income', value: taxData.dividends_received },
                { label: 'Interest income', value: taxData.interest_received },
                { label: 'Short-term capital gains', value: taxData.capital_gains_short_term },
                { label: 'Long-term capital gains', value: taxData.capital_gains_long_term },
                { label: 'Less: CGT discount (50%)', value: -taxData.cgt_discount_applied },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
                  <span className="text-[15px] text-[var(--c-ink)]">{label}</span>
                  <span className={`text-[15px] font-medium ${value >= 0 ? 'text-[var(--c-ink)]' : 'text-[var(--c-bull)]'}`}>
                    {value >= 0 ? '' : '('}{formatCurrency(Math.abs(value), currency)}{value < 0 ? ')' : ''}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3 border-t-2 border-[var(--c-border)]">
                <span className="text-[17px] font-semibold text-[var(--c-ink)]">Total taxable income</span>
                <span className="text-[17px] font-semibold text-[var(--c-ink)]">
                  {formatCurrency(taxData.total_taxable_income, currency)}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
