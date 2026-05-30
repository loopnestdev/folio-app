import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { GroupSummary, GroupCapitalGain, GroupTaxReport, PerformancePoint } from '../types';
import { dateRangeToParams } from '../lib/utils';
import type { DateRange } from '../types';

// ── Group Summary ────────────────────────────────────────────
export function useGroupSummary(groupId?: string) {
  return useQuery({
    queryKey: ['group-summary', groupId],
    queryFn: async () => {
      const { data } = await api.get<GroupSummary>(`/api/groups/${groupId}/summary`);
      return data;
    },
    enabled: !!groupId,
  });
}

// ── Group Performance ────────────────────────────────────────
interface GroupPerformanceOptions {
  groupId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function useGroupPerformance({ groupId, range, customStart, customEnd }: GroupPerformanceOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-performance', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<PerformancePoint[]>(
        `/api/groups/${groupId}/performance`,
        { params },
      );
      return data;
    },
    enabled: !!groupId,
    // Performance data can take a few seconds — keep stale longer
    staleTime: 1000 * 60 * 10,
  });
}

// ── Group Capital Gains ──────────────────────────────────────
interface GroupCgtOptions {
  groupId?: string;
  fyStart: 'january' | 'july';
  year: string;
}

export function useGroupCapitalGains({ groupId, fyStart, year }: GroupCgtOptions) {
  return useQuery({
    queryKey: ['group-capital-gains', groupId, fyStart, year],
    queryFn: async () => {
      const { data } = await api.get<GroupCapitalGain[]>(
        `/api/groups/${groupId}/capital-gains`,
        { params: { fyStart, year } },
      );
      return data;
    },
    enabled: !!groupId && !!year,
  });
}

// ── Group Tax ────────────────────────────────────────────────
interface GroupTaxOptions {
  groupId?: string;
  fyStart: 'january' | 'july';
  year: string;
}

export function useGroupTax({ groupId, fyStart, year }: GroupTaxOptions) {
  return useQuery({
    queryKey: ['group-tax', groupId, fyStart, year],
    queryFn: async () => {
      const { data } = await api.get<GroupTaxReport>(
        `/api/groups/${groupId}/tax`,
        { params: { fyStart, year } },
      );
      return data;
    },
    enabled: !!groupId && !!year,
  });
}
