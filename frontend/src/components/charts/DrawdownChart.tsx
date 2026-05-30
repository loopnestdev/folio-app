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

const COLOR_BEAR = '#ea2261';

function RechartsDrawdownChart({ data }: DrawdownChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLOR_BEAR} stopOpacity={0.3} />
            <stop offset="95%" stopColor={COLOR_BEAR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: 'var(--c-ink-mute)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--c-ink-mute)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatPercent(v, 1)}
        />
        <Tooltip
          formatter={(value: any) => [formatPercent(value, 2), 'Drawdown']}
          contentStyle={{ borderRadius: 12, border: '1px solid var(--c-border)', fontSize: 13 }}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke={COLOR_BEAR}
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
      axisLabel: { fontSize: 12, color: 'var(--c-ink-mute)' },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        color: 'var(--c-ink-mute)',
        formatter: (v: number) => formatPercent(v, 1),
      },
      splitLine: { lineStyle: { color: 'var(--c-border)' } },
    },
    series: [
      {
        type: 'line',
        data: data.map((d) => d.drawdown),
        smooth: true,
        lineStyle: { color: COLOR_BEAR, width: 1.5 },
        itemStyle: { color: COLOR_BEAR },
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(234,34,97,0.3)' },
              { offset: 1, color: 'rgba(234,34,97,0)' },
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
        <div className="w-8 h-8 border-2 border-[var(--c-border)] border-t-[var(--c-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-[var(--c-ink-mute)]">
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
