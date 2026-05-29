import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import type { PerformancePoint, BenchmarkToggle } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface PerformanceChartProps {
  data: PerformancePoint[];
  benchmarks: BenchmarkToggle;
  currency?: string;
  loading?: boolean;
}

function RechartsPerformanceChart({ data, benchmarks, currency = 'USD' }: PerformanceChartProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTooltipValue = (value: any) => formatCurrency(Number(value) || 0, currency);

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
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
          formatter={formatTooltipValue}
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #e0e0e0',
            fontSize: 13,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        <Line
          type="monotone"
          dataKey="portfolio_value"
          name="Portfolio"
          stroke="#0066cc"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {benchmarks.sp500 && (
          <Line
            type="monotone"
            dataKey="benchmark_sp500"
            name="S&P 500"
            stroke="#34c759"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 4"
            activeDot={{ r: 3 }}
          />
        )}
        {benchmarks.nasdaq && (
          <Line
            type="monotone"
            dataKey="benchmark_nasdaq"
            name="NASDAQ"
            stroke="#ff9500"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 4"
            activeDot={{ r: 3 }}
          />
        )}
        {benchmarks.asx200 && (
          <Line
            type="monotone"
            dataKey="benchmark_asx200"
            name="ASX 200"
            stroke="#5856d6"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 4"
            activeDot={{ r: 3 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function EChartsPerformanceChart({ data, benchmarks, currency = 'USD' }: PerformanceChartProps) {
  const series = [
    {
      name: 'Portfolio',
      type: 'line',
      data: data.map((d) => [d.date, d.portfolio_value]),
      smooth: true,
      lineStyle: { color: '#0066cc', width: 2 },
      itemStyle: { color: '#0066cc' },
      showSymbol: false,
    },
    ...(benchmarks.sp500
      ? [
          {
            name: 'S&P 500',
            type: 'line',
            data: data.map((d) => [d.date, d.benchmark_sp500]),
            smooth: true,
            lineStyle: { color: '#34c759', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#34c759' },
            showSymbol: false,
          },
        ]
      : []),
    ...(benchmarks.nasdaq
      ? [
          {
            name: 'NASDAQ',
            type: 'line',
            data: data.map((d) => [d.date, d.benchmark_nasdaq]),
            smooth: true,
            lineStyle: { color: '#ff9500', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#ff9500' },
            showSymbol: false,
          },
        ]
      : []),
    ...(benchmarks.asx200
      ? [
          {
            name: 'ASX 200',
            type: 'line',
            data: data.map((d) => [d.date, d.benchmark_asx200]),
            smooth: true,
            lineStyle: { color: '#5856d6', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#5856d6' },
            showSymbol: false,
          },
        ]
      : []),
  ];

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ seriesName: string; value: [string, number] }>) => {
        const date = params[0]?.value[0];
        const rows = params
          .map((p) => `<div>${p.seriesName}: ${formatCurrency(p.value[1], currency)}</div>`)
          .join('');
        return `<div style="font-size:13px"><strong>${date}</strong>${rows}</div>`;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 13, color: '#7a7a7a' } },
    grid: { top: 10, right: 20, bottom: 40, left: 60 },
    xAxis: {
      type: 'category',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: '#7a7a7a' },
      splitLine: { show: false },
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
    series,
  };

  return <ReactECharts option={option} style={{ height: 350 }} />;
}

export function PerformanceChart(props: PerformanceChartProps) {
  const { chartLibrary } = useSettings();

  if (props.loading) {
    return (
      <div className="h-[350px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-[#7a7a7a]">
        No performance data available
      </div>
    );
  }

  return chartLibrary === 'echarts' ? (
    <EChartsPerformanceChart {...props} />
  ) : (
    <RechartsPerformanceChart {...props} />
  );
}
