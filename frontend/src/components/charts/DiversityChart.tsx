import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import type { DiversityAllocation } from '../../types';
import { CHART_COLORS } from '../../lib/utils';

interface DiversityChartProps {
  data: DiversityAllocation[];
  title?: string;
  loading?: boolean;
  /** Show the built-in legend (default true); off when a list beside the chart already names each slice */
  legend?: boolean;
}

function RechartsDiversityChart({ data, legend = true }: DiversityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="pct"
          nameKey="name"
          cx="50%"
          cy={legend ? '45%' : '50%'}
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
          contentStyle={{ borderRadius: 12, border: '1px solid var(--c-border)', fontSize: 13 }}
        />
        {legend && <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

function EChartsDiversityChart({ data, legend = true }: DiversityChartProps) {
  const option = {
    tooltip: {
      trigger: 'item',
      // The slice's own pct (as Recharts shows), not its normalised share of the sum
      formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value.toFixed(1)}%`,
    },
    legend: {
      show: legend,
      bottom: 0,
      textStyle: { fontSize: 13, color: 'var(--c-ink-mute)' },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', legend ? '45%' : '50%'],
        padAngle: 3,
        data: data.map((d, idx) => ({
          name: d.name,
          value: d.pct,
          itemStyle: { color: d.color || CHART_COLORS[idx % CHART_COLORS.length] },
        })),
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}

export function DiversityChart(props: DiversityChartProps) {
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
        No allocation data available
      </div>
    );
  }

  return chartLibrary === 'echarts' ? (
    <EChartsDiversityChart {...props} />
  ) : (
    <RechartsDiversityChart {...props} />
  );
}
