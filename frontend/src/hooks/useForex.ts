import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ForexRateResult {
  from: string;
  to: string;
  date: string;
  /** How many `to` currency units equal 1 `from` unit.  e.g. 1.58 means 1 USD = 1.58 AUD */
  rate: number;
}

/**
 * Fetch the historical exchange rate for a given currency pair and date.
 *
 * Only fires when `from`, `to`, and `date` are all truthy, and `from !== to`.
 * Results are cached for 1 hour — forex rates for past dates never change.
 */
export function useForexRate(from?: string, to?: string, date?: string) {
  return useQuery({
    queryKey: ['forex', from, to, date],
    queryFn: async () => {
      const { data } = await api.get<ForexRateResult>('/api/forex', {
        params: { from, to, date },
      });
      return data;
    },
    enabled: !!from && !!to && !!date && from !== to,
    staleTime: 1000 * 60 * 60, // 1 hour — historical rates never change
    gcTime:    1000 * 60 * 60 * 24, // keep in cache for 24 hours
  });
}
