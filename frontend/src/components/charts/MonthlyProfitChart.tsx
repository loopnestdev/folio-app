import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import type { MonthlyProfit } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface MonthlyProfitChartProps {
  data: MonthlyProfit[];
  currency?: string;
  loading?: boolean;
  mode?: 'profit' | 'percent';
}

function RechartsMonthlyProfitChart({ data, currency = 'USD', mode = 'profit' }: MonthlyProfitChartProps) {
  const isPercent = mode === 'percent';
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
        <XAxis
          dataKey="month_label"
          tick={{ fontSize: 12, fill: 'var(--c-ink-mute)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--c-ink-mute)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            isPercent ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : formatCurrency(v, currency, { notation: 'compact' })
          }
        />
        <Tooltip
          formatter={(value: any) =>
            isPercent
              ? [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`, 'Return']
              : [formatCurrency(value, currency), 'P&L']
          }
          contentStyle={{ borderRadius: 12, border: '1px solid var(--c-border)', fontSize: 13 }}
        />
        <Bar dataKey={isPercent ? 'return_pct' : 'profit'} radius={[4, 4, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={(isPercent ? entry.return_pct : entry.profit) >= 0 ? '#059669' : '#ea2261'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EChartsMonthlyProfitChart({ data, currency = 'USD', mode = 'profit' }: MonthlyProfitChartProps) {
  const isPercent = mode === 'percent';
  const values = data.map((d) => (isPercent ? d.return_pct : d.profit));

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        const formatted = isPercent
          ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%`
          : formatCurrency(p.value, currency);
        const label = isPercent ? 'Return' : 'P&L';
        return `<div style="font-size:13px"><strong>${p.name}</strong><br/>${label}: ${formatted}</div>`;
      },
    },
    grid: { top: 10, right: 20, bottom: 30, left: 70 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.month_label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: 'var(--c-ink-mute)' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        color: 'var(--c-ink-mute)',
        formatter: (v: number) =>
          isPercent ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : formatCurrency(v, currency, { notation: 'compact' }),
      },
      splitLine: { lineStyle: { color: 'var(--c-border)' } },
    },
    series: [
      {
        type: 'bar',
        data: values.map((v) => ({
          value: v,
          itemStyle: { color: v >= 0 ? '#059669' : '#ea2261', borderRadius: [4, 4, 0, 0] },
        })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}

export function MonthlyProfitChart(props: MonthlyProfitChartProps) {
  const { chartLibrary } = useSettings();

  if (props.loading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--c-border)] border-t-[var(--c-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-[var(--c-ink-mute)]">
        No monthly data available
      </div>
    );
  }

  return chartLibrary === 'echarts' ? (
    <EChartsMonthlyProfitChart {...props} />
  ) : (
    <RechartsMonthlyProfitChart {...props} />
  );
}
