import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  GroupSummary, GroupCapitalGain, GroupTaxReport, PerformancePoint,
  MonthlyProfit, DividendSummary, PortfolioDiversity, PortfolioStatistics, Holding,
  GroupReconcileResult,
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
interface GroupRangedOptions {
  groupId?: string;
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function useGroupCapitalGains({ groupId, range, customStart, customEnd }: GroupRangedOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-capital-gains', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<GroupCapitalGain[]>(
        `/api/groups/${groupId}/capital-gains`,
        { params },
      );
      return data;
    },
    enabled: !!groupId,
  });
}

// ── Group Cash Flows ─────────────────────────────────────────
export function useGroupCashFlows({ groupId, range, customStart, customEnd }: GroupRangedOptions) {
  const params = dateRangeToParams(range, customStart, customEnd);
  return useQuery({
    queryKey: ['group-cash-flows', groupId, range, customStart, customEnd],
    queryFn: async () => {
      const { data } = await api.get<{
        transactions: any[];
        summary: { total_deposited: number; total_withdrawn: number; net_deposited: number };
      }>(`/api/groups/${groupId}/cash-flows`, { params });
      return data;
    },
    enabled: !!groupId,
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

// ── Group Tax Export (xlsx / pdf) ─────────────────────────────
// Not a query — a one-off download action, so it's a plain async function
// rather than a useQuery hook. Returns the file so the caller can trigger
// a browser save with downloadBlob().
interface GroupTaxExportOptions {
  groupId: string;
  fyStart: 'january' | 'july';
  year: string;
  format: 'xlsx' | 'pdf';
}

export async function fetchGroupTaxExport(
  { groupId, fyStart, year, format }: GroupTaxExportOptions,
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get(`/api/groups/${groupId}/tax/export`, {
    params: { fyStart, year, format },
    responseType: 'blob',
  });

  // Prefer the server-supplied filename (Content-Disposition); fall back to a
  // sensible default if the header is missing or unparsable.
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `group-tax-report.${format}`;

  return { blob: response.data as Blob, filename };
}

// ── Group Reconcile (upload Moomoo annual summary, compare vs. database) ──────
// Not a query — a one-off upload+compare action, so it's a plain async
// function rather than a useQuery hook. Nothing is imported or modified;
// this only reports whether the two sources agree.
export async function reconcileGroup(groupId: string, file: File): Promise<GroupReconcileResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<GroupReconcileResult>(
    `/api/groups/${groupId}/reconcile`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
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
