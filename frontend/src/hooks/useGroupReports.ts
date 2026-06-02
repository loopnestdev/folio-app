import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  GroupSummary, GroupCapitalGain, GroupTaxReport, PerformancePoint,
  MonthlyProfit, DividendSummary, PortfolioDiversity, PortfolioStatistics, Holding,
} from '../types';
import { dateRangeToParams } from '../lib/utils';
import type { DateRange } from '../types';

// ── Group Holdings ───────────────────────────────────────────
export function useGroupHoldings(groupId?: string) {
  return useQuery({
    queryKey: ['group-holdings', groupId],
    queryFn: async () => {
      const { data } = await api.get<{ holdings: Holding[]; summary: unknown }>(
        `/api/groups/${groupId}/holdings`,
      );
      return data.holdings ?? [];
    },
    enabled: !!groupId,
  });
}

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

// ── Group Monthly Profit ─────────────────────────────────────
interface GroupMonthlyProfitOptions {
  groupId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function useGroupMonthlyProfit({ groupId, range, customStart, customEnd }: GroupMonthlyProfitOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-monthly-profit', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<MonthlyProfit[]>(
        `/api/groups/${groupId}/monthly-profit`,
        { params },
      );
      return data;
    },
    enabled: !!groupId,
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

// ── Group Dividends ──────────────────────────────────────────
interface GroupRangeOptions {
  groupId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function useGroupDividends({ groupId, range, customStart, customEnd }: GroupRangeOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-dividends', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<DividendSummary>(`/api/groups/${groupId}/dividends`, { params });
      return data;
    },
    enabled: !!groupId,
  });
}

// ── Group Diversity ──────────────────────────────────────────
export function useGroupDiversity({ groupId }: { groupId?: string }) {
  return useQuery({
    queryKey: ['group-diversity', groupId],
    queryFn: async () => {
      const { data } = await api.get<PortfolioDiversity>(`/api/groups/${groupId}/diversity`);
      return data;
    },
    enabled: !!groupId,
  });
}

// ── Group Drawdown ───────────────────────────────────────────
export function useGroupDrawdown({ groupId, range, customStart, customEnd }: GroupRangeOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-drawdown', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<Array<{ date: string; drawdown: number }>>(
        `/api/groups/${groupId}/drawdown`,
        { params },
      );
      return data;
    },
    enabled: !!groupId,
  });
}

// ── Group Statistics ─────────────────────────────────────────
export function useGroupStatistics({ groupId, range, customStart, customEnd }: GroupRangeOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-statistics', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<PortfolioStatistics>(`/api/groups/${groupId}/statistics`, { params });
      return data;
    },
    enabled: !!groupId,
  });
}
