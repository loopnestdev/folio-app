import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  MonthlyProfit,
  DividendSummary,
  CapitalGain,
  PortfolioDiversity,
  TaxReport,
  DateRange,
  UpcomingDividends,
} from '../types';
import { dateRangeToParams } from '../lib/utils';

interface ReportOptions {
  portfolioId?: string;
  range?: DateRange;
  customStart?: string;
  customEnd?: string;
}

// Monthly profit report
export function useMonthlyProfit({ portfolioId, range = '1Y', customStart, customEnd }: ReportOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);

  return useQuery({
    queryKey: ['monthly-profit', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<MonthlyProfit[]>(
        `/api/portfolios/${portfolioId}/reports/monthly-profit`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Dividends report
export function useDividends({ portfolioId, range = '1Y', customStart, customEnd }: ReportOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);

  return useQuery({
    queryKey: ['dividends', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<DividendSummary>(
        `/api/portfolios/${portfolioId}/reports/dividends`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Capital gains report — accepts a standard date range (same as other report hooks).
export function useCapitalGains({ portfolioId, range = 'ALL', customStart, customEnd }: ReportOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['capital-gains', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<CapitalGain[]>(
        `/api/portfolios/${portfolioId}/reports/capital-gains`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Cash flows report — deposits and withdrawals for a date range.
export function useCashFlows({ portfolioId, range = 'ALL', customStart, customEnd }: ReportOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['cash-flows', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<{
        transactions: any[];
        summary: { total_deposited: number; total_withdrawn: number; net_deposited: number };
      }>(`/api/portfolios/${portfolioId}/reports/cash-flows`, { params });
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Diversity report
export function useDiversity({ portfolioId }: { portfolioId?: string }) {
  return useQuery({
    queryKey: ['diversity', portfolioId],
    queryFn: async () => {
      const { data } = await api.get<PortfolioDiversity>(
        `/api/portfolios/${portfolioId}/reports/diversity`,
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Tax report
interface TaxReportOptions {
  portfolioId?: string;
  financialYear: string;
  yearType: 'jan-dec' | 'jul-jun';
}

export function useTaxReport({ portfolioId, financialYear, yearType }: TaxReportOptions) {
  return useQuery({
    queryKey: ['tax-report', portfolioId, financialYear, yearType],
    queryFn: async () => {
      const { data } = await api.get<TaxReport>(
        `/api/portfolios/${portfolioId}/reports/tax`,
        { params: { financial_year: financialYear, year_type: yearType } },
      );
      return data;
    },
    enabled: !!portfolioId && !!financialYear,
  });
}

// Upcoming dividends
export function useUpcomingDividends({ portfolioId }: { portfolioId?: string }) {
  return useQuery({
    queryKey: ['upcoming-dividends', portfolioId],
    queryFn: async () => {
      const { data } = await api.get<UpcomingDividends>(
        `/api/portfolios/${portfolioId}/reports/upcoming-dividends`,
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Drawdown data
export function useDrawdown({ portfolioId, range = '1Y', customStart, customEnd }: ReportOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);

  return useQuery({
    queryKey: ['drawdown', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<Array<{ date: string; drawdown: number }>>(
        `/api/portfolios/${portfolioId}/reports/drawdown`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}
