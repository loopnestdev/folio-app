import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TargetPortfolioGroup, TargetPortfolioGroupMember } from '../types';
import { GROUPS_QUERY_KEY } from './useTargetPortfolios';

const TARGETS_QUERY_KEY = 'target-portfolios';

type GroupFields = {
  name?: string;
  description?: string | null;
  investable_amount?: number | null;
  investable_currency?: string;
};

// ── List all ─────────────────────────────────────────────────
export function useTargetPortfolioGroups() {
  return useQuery({
    queryKey: [GROUPS_QUERY_KEY],
    queryFn: async () => {
      const { data } = await api.get<TargetPortfolioGroup[]>('/api/target-portfolio-groups');
      return data;
    },
  });
}

// ── Single ───────────────────────────────────────────────────
export function useTargetPortfolioGroup(id: string | undefined) {
  return useQuery({
    queryKey: [GROUPS_QUERY_KEY, id],
    queryFn: async () => {
      const { data } = await api.get<TargetPortfolioGroup>(`/api/target-portfolio-groups/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// ── Create ───────────────────────────────────────────────────
export function useCreateTargetPortfolioGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: GroupFields & { name: string }) => {
      const { data } = await api.post<TargetPortfolioGroup>('/api/target-portfolio-groups', values);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] }),
  });
}

// ── Update name / description / investable amount ────────────
export function useUpdateTargetPortfolioGroup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: GroupFields) => {
      const { data } = await api.patch<TargetPortfolioGroup>(`/api/target-portfolio-groups/${id}`, values);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] }),
  });
}

// ── Delete ───────────────────────────────────────────────────
export function useDeleteTargetPortfolioGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/target-portfolio-groups/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] }),
  });
}

// ── Replace all members ──────────────────────────────────────
export function useSetTargetPortfolioGroupMembers(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (members: Array<{ target_portfolio_id: string; weight_pct: number; sort_order?: number }>) => {
      const { data } = await api.put<TargetPortfolioGroupMember[]>(`/api/target-portfolio-groups/${id}/members`, members);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] }),
  });
}

// ── Activate (one active plan overall, so target portfolios refresh too) ──
export function useActivateTargetPortfolioGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<TargetPortfolioGroup>(`/api/target-portfolio-groups/${id}/activate`, {});
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [TARGETS_QUERY_KEY] });
    },
  });
}
