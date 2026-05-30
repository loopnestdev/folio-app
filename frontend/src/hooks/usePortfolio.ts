import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Portfolio, PortfolioSummary, Trade, BackendTradeType, Holding, TradeFilter } from '../types';
import { usePortfolioContext } from '../contexts/PortfolioContext';

// Fetch all portfolios
export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data } = await api.get<Portfolio[]>('/api/portfolios');
      return data;
    },
  });
}

// Fetch single portfolio summary
export function usePortfolioSummary(portfolioId?: string) {
  return useQuery({
    queryKey: ['portfolio-summary', portfolioId],
    queryFn: async () => {
      const { data } = await api.get<PortfolioSummary>(`/api/portfolios/${portfolioId}/summary`);
      return data;
    },
    enabled: !!portfolioId,
  });
}

// Fetch active portfolio summary
export function useActivePortfolioSummary() {
  const { activePortfolio } = usePortfolioContext();
  return usePortfolioSummary(activePortfolio?.id);
}

// Fetch holdings for a portfolio
// Backend returns { holdings: Holding[], summary: {...} } — extract the array.
export function useHoldings(portfolioId?: string) {
  return useQuery({
    queryKey: ['holdings', portfolioId],
    queryFn: async () => {
      const { data } = await api.get<{ holdings: Holding[]; summary: unknown }>(
        `/api/portfolios/${portfolioId}/holdings`,
      );
      return data.holdings ?? [];
    },
    enabled: !!portfolioId,
  });
}

// Fetch trades for a portfolio — backend returns paginated { data, total, page, limit }
export function useTrades(portfolioId?: string, filters?: TradeFilter) {
  return useQuery({
    queryKey: ['trades', portfolioId, filters],
    queryFn: async () => {
      const { data } = await api.get<{ data: Trade[]; total: number; page: number; limit: number }>(
        `/api/portfolios/${portfolioId}/trades`,
        { params: filters },
      );
      return data.data; // extract the array from the paginated wrapper
    },
    enabled: !!portfolioId,
  });
}

// Create portfolio mutation
export function useCreatePortfolio() {
  const queryClient = useQueryClient();
  const { setActivePortfolio } = usePortfolioContext();

  return useMutation({
    mutationFn: async (values: Omit<Portfolio, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      const { data } = await api.post<Portfolio>('/api/portfolios', values);
      return data;
    },
    onSuccess: (portfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setActivePortfolio(portfolio);
    },
  });
}

// Update portfolio mutation
export function useUpdatePortfolio(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<Portfolio>) => {
      const { data } = await api.patch<Portfolio>(`/api/portfolios/${portfolioId}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary', portfolioId] });
    },
  });
}

// Delete portfolio mutation
export function useDeletePortfolio() {
  const queryClient = useQueryClient();
  const { activePortfolio, setActivePortfolio } = usePortfolioContext();

  return useMutation({
    mutationFn: async (portfolioId: string) => {
      await api.delete(`/api/portfolios/${portfolioId}`);
      return portfolioId;
    },
    onSuccess: (portfolioId) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      if (activePortfolio?.id === portfolioId) {
        setActivePortfolio(null);
      }
    },
  });
}

/** Payload for creating a trade — maps 1-to-1 with the backend tradeSchema. */
export interface AddTradePayload {
  trade_date: string;
  trade_type: BackendTradeType;
  symbol: string;
  security_name?: string;
  exchange?: string;
  quantity: number;
  price: number;
  brokerage?: number;
  gst?: number;
  currency: string;
  exchange_rate?: number;
  notes?: string | null;
}

// Add trade mutation
export function useAddTrade(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddTradePayload) => {
      const { data } = await api.post<Trade>(`/api/portfolios/${portfolioId}/trades`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary', portfolioId] });
    },
  });
}

// Delete trade mutation
export function useDeleteTrade(portfolioId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tradeId: string) => {
      await api.delete(`/api/portfolios/${portfolioId}/trades/${tradeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary', portfolioId] });
    },
  });
}
