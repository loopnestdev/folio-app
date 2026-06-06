import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TargetPortfolio, TargetPortfolioItem, RebalanceResult } from '../types';

const QUERY_KEY = 'target-portfolios';

// ── List all ─────────────────────────────────────────────────
export function useTargetPortfolios() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: async () => {
      const { data } = await api.get<TargetPortfolio[]>('/api/target-portfolios');
      return data;
    },
  });
}

// ── Single ───────────────────────────────────────────────────
export function useTargetPortfolio(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: async () => {
      const { data } = await api.get<TargetPortfolio>(`/api/target-portfolios/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// ── Create ───────────────────────────────────────────────────
export function useCreateTargetPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string | null }) => {
      const { data } = await api.post<TargetPortfolio>('/api/target-portfolios', values);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Update name / description ─────────────────────────────────
export function useUpdateTargetPortfolio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name?: string; description?: string | null }) => {
      const { data } = await api.patch<TargetPortfolio>(`/api/target-portfolios/${id}`, values);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Delete ───────────────────────────────────────────────────
export function useDeleteTargetPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/target-portfolios/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Replace all items ─────────────────────────────────────────
export function useSetTargetPortfolioItems(portfolioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      items: Array<{
        symbol: string;
        exchange?: string | null;
        category?: string | null;
        allocation_pct: number;
        sort_order?: number;
      }>,
    ) => {
      const { data } = await api.put<TargetPortfolioItem[]>(
        `/api/target-portfolios/${portfolioId}/items`,
        items,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Activate ─────────────────────────────────────────────────
export function useActivateTargetPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<TargetPortfolio>(
        `/api/target-portfolios/${id}/activate`,
        {},
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Rebalance analysis ────────────────────────────────────────
export function useRebalance(
  targetPortfolioId: string | undefined,
  portfolioId: string | undefined,
) {
  return useQuery({
    queryKey: [QUERY_KEY, targetPortfolioId, 'rebalance', portfolioId],
    queryFn: async () => {
      const { data } = await api.get<RebalanceResult>(
        `/api/target-portfolios/${targetPortfolioId}/rebalance`,
        { params: { portfolioId } },
      );
      return data;
    },
    enabled: !!targetPortfolioId && !!portfolioId,
  });
}
