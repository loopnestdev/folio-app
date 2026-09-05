import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { useTaxReport } from '../../hooks/useReports';
import { useGroupTax } from '../../hooks/useGroupReports';
import { useReportViewSwitcher } from '../../hooks/useReportViewSwitcher';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { ReportViewSwitcher } from '../../components/ui/ReportViewSwitcher';
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
  const view = useReportViewSwitcher(id);
  const { financialYear: fyType } = useSettings();

  const currency = view.currency;

  const currentYear = new Date().getFullYear();
  const defaultYear =
    fyType === 'jan-dec'
      ? String(currentYear)
      : `${currentYear - 1}-${currentYear}`;

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [yearType, setYearType] = useState<'jan-dec' | 'jul-jun'>(fyType);

  const years = getFinancialYears(yearType);

  // Convert selectedYear + yearType to fyStart + year for group tax hook
  const grpFyStart: 'january' | 'july' = yearType === 'jul-jun' ? 'july' : 'january';
  const grpYear = yearType === 'jul-jun'
    ? (selectedYear.split('-')[1] ?? String(currentYear))
    : selectedYear;

  const { data: indTax, isLoading: indLoading } = useTaxReport({
    portfolioId: view.portfolioId,
    financialYear: selectedYear,
    yearType,
  });
  const { data: grpTax, isLoading: grpLoading } = useGroupTax({
    groupId: view.groupId,
    fyStart: grpFyStart,
    year: grpYear,
  });
  const taxData  = view.viewMode === 'group' ? grpTax : indTax;
  const isLoading = view.viewMode === 'group' ? grpLoading : indLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Tax Report</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Income and capital gains for tax purposes{view.displayName ? ` · ${view.displayName}` : ''}</p>
        </div>
        {view.hasGroups && (
          <ReportViewSwitcher
            viewMode={view.viewMode} portfolios={view.portfolios} groups={view.groups}
            activePortfolioId={view.activePortfolioId} activeGroupId={view.activeGroupId}
            onViewModeChange={view.onViewModeChange} onPortfolioChange={view.onPortfolioChange} onGroupChange={view.onGroupChange}
          />
        )}
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
              label="Other Income Received"
              value={formatCurrency(taxData.other_income_received, currency)}
            />
            <StatCard
              label="Capital Gains (Short Term)"
              value={formatCurrency(taxData.capital_gains_short_term, currency)}
            />
            <StatCard
              label="Capital Gains (Long Term)"
              value={formatCurrency(taxData.capital_gains_long_term, currency)}
            />
            <StatCard
              label="CGT Discount Applied"
              value={formatCurrency(taxData.cgt_discount_applied, currency)}
            />
            <StatCard
              label="Total Taxable Income"
              value={formatCurrency(taxData.total_taxable_income, currency)}
            />
          </div>

          {/* Details */}
          <Card>
            <CardHeader title={`Tax Summary — ${taxData.financial_year}`} />
            <div className="space-y-3">
              {[
                { label: 'Dividend income', value: taxData.dividends_received },
                { label: 'Interest income', value: taxData.interest_received },
                { label: 'Other income', value: taxData.other_income_received },
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
