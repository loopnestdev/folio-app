import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TargetPortfolio, TargetPortfolioItem, RebalanceResult, RebalanceBase, RebalanceComparisonRef } from '../types';

const QUERY_KEY = 'target-portfolios';
// Shared with useTargetPortfolioGroups: activating either kind deactivates the other
export const GROUPS_QUERY_KEY = 'target-portfolio-groups';

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
    mutationFn: async (values: { name?: string; description?: string | null; investable_amount?: number | null; investable_currency?: string }) => {
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
      qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] });
    },
  });
}

// ── Rebalance analysis ────────────────────────────────────────
// `kind` picks the endpoint: a single target portfolio, or a target group.
export function useRebalance(
  kind: 'portfolio' | 'group',
  targetId: string | undefined,
  comparison: RebalanceComparisonRef | undefined,
  base: RebalanceBase,
) {
  const path = kind === 'group' ? 'target-portfolio-groups' : 'target-portfolios';
  return useQuery({
    queryKey: [kind === 'group' ? GROUPS_QUERY_KEY : QUERY_KEY, targetId, 'rebalance', comparison, base],
    queryFn: async () => {
      const { data } = await api.get<RebalanceResult>(`/api/${path}/${targetId}/rebalance`, {
        params: { ...comparison, base },
      });
      return data;
    },
    enabled: !!targetId && !!comparison,
    retry: false,
  });
}
