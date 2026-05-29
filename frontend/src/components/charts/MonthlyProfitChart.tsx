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
}

function RechartsMonthlyProfitChart({ data, currency = 'USD' }: MonthlyProfitChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="month_label"
          tick={{ fontSize: 12, fill: '#7a7a7a' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#7a7a7a' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatCurrency(v, currency, { notation: 'compact' })}
        />
        <Tooltip
          formatter={(value: any) => [formatCurrency(value, currency), 'P&L']}
          contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 13 }}
        />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={entry.profit >= 0 ? '#34c759' : '#ff3b30'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EChartsMonthlyProfitChart({ data, currency = 'USD' }: MonthlyProfitChartProps) {
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        return `<div style="font-size:13px"><strong>${p.name}</strong><br/>P&L: ${formatCurrency(p.value, currency)}</div>`;
      },
    },
    grid: { top: 10, right: 20, bottom: 30, left: 70 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.month_label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: '#7a7a7a' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        color: '#7a7a7a',
        formatter: (v: number) => formatCurrency(v, currency, { notation: 'compact' }),
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => ({
          value: d.profit,
          itemStyle: { color: d.profit >= 0 ? '#34c759' : '#ff3b30', borderRadius: [4, 4, 0, 0] },
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
        <div className="w-8 h-8 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-[#7a7a7a]">
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
