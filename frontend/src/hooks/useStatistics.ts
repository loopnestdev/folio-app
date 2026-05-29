import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PortfolioStatistics, DateRange } from '../types';
import { dateRangeToParams } from '../lib/utils';

interface UseStatisticsOptions {
  portfolioId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function useStatistics({ portfolioId, range, customStart, customEnd }: UseStatisticsOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);

  return useQuery({
    queryKey: ['statistics', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<PortfolioStatistics>(
        `/api/portfolios/${portfolioId}/statistics`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}
