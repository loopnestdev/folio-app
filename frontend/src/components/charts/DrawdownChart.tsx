import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import { formatPercent } from '../../lib/utils';

interface DrawdownPoint {
  date: string;
  drawdown: number;
}

interface DrawdownChartProps {
  data: DrawdownPoint[];
  loading?: boolean;
}

function RechartsDrawdownChart({ data }: DrawdownChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ff3b30" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ff3b30" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v: number) => formatPercent(v, 1)}
        />
        <Tooltip
          formatter={(value: any) => [formatPercent(value, 2), 'Drawdown']}
          contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 13 }}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#ff3b30"
          fill="url(#drawdownGradient)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EChartsDrawdownChart({ data }: DrawdownChartProps) {
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        return `<div style="font-size:13px"><strong>${p.name}</strong><br/>Drawdown: ${formatPercent(p.value, 2)}</div>`;
      },
    },
    grid: { top: 10, right: 20, bottom: 30, left: 60 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: '#7a7a7a' },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        color: '#7a7a7a',
        formatter: (v: number) => formatPercent(v, 1),
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [
      {
        type: 'line',
        data: data.map((d) => d.drawdown),
        smooth: true,
        lineStyle: { color: '#ff3b30', width: 1.5 },
        itemStyle: { color: '#ff3b30' },
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255,59,48,0.3)' },
              { offset: 1, color: 'rgba(255,59,48,0)' },
            ],
          },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 250 }} />;
}

export function DrawdownChart(props: DrawdownChartProps) {
  const { chartLibrary } = useSettings();

  if (props.loading) {
    return (
      <div className="h-[250px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-[#7a7a7a]">
        No drawdown data available
      </div>
    );
  }

  return chartLibrary === 'echarts' ? (
    <EChartsDrawdownChart {...props} />
  ) : (
    <RechartsDrawdownChart {...props} />
  );
}
