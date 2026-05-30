import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PortfolioGroup } from '../types';

// ── Read ────────────────────────────────────────────────────
export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await api.get<PortfolioGroup[]>('/api/groups');
      return data;
    },
  });
}

// ── Create ──────────────────────────────────────────────────
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string | null; base_currency?: string }) => {
      const { data } = await api.post<PortfolioGroup>('/api/groups', values);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

// ── Update ──────────────────────────────────────────────────
export function useUpdateGroup(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name?: string; description?: string | null; base_currency?: string }) => {
      const { data } = await api.patch<PortfolioGroup>(`/api/groups/${groupId}`, values);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

// ── Delete ──────────────────────────────────────────────────
export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      await api.delete(`/api/groups/${groupId}`);
      return groupId;
    },
    onSuccess: () => {
      // Portfolios' group_id is cleared by FK ON DELETE SET NULL on the DB side.
      // Refresh both so the UI reflects the un-grouping immediately.
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
}

// ── Assign portfolio to group ────────────────────────────────
export function useAssignPortfolioToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      portfolioId,
      groupId,
    }: {
      portfolioId: string;
      groupId: string | null;
    }) => {
      const { data } = await api.patch(`/api/portfolios/${portfolioId}`, { group_id: groupId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
}
