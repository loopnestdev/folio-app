import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PerformancePoint, DateRange } from '../types';
import { dateRangeToParams } from '../lib/utils';

interface UsePerformanceOptions {
  portfolioId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function usePerformance({ portfolioId, range, customStart, customEnd }: UsePerformanceOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);

  return useQuery({
    queryKey: ['performance', portfolioId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<PerformancePoint[]>(
        `/api/portfolios/${portfolioId}/performance`,
        { params },
      );
      return data;
    },
    enabled: !!portfolioId,
  });
}
