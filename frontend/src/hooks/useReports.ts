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

// Capital gains report — uses FY-based params (fyStart + year) to match the backend.
// The backend /reports/capital-gains endpoint only reads fyStart and year; the old
// date-range params (start_date / end_date) were silently ignored.
export function useCapitalGains({
  portfolioId,
  fyStart = 'july',
  year,
}: {
  portfolioId?: string;
  fyStart?: 'january' | 'july';
  year?: string;
}) {
  const currentYear = String(new Date().getFullYear());
  const y = year ?? currentYear;

  return useQuery({
    queryKey: ['capital-gains', portfolioId, fyStart, y],
    queryFn: async () => {
      const { data } = await api.get<CapitalGain[]>(
        `/api/portfolios/${portfolioId}/reports/capital-gains`,
        { params: { fyStart, year: y } },
      );
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
