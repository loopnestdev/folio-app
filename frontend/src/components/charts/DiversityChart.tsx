import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import type { DiversityAllocation } from '../../types';
import { CHART_COLORS, formatPercent } from '../../lib/utils';

interface DiversityChartProps {
  data: DiversityAllocation[];
  title?: string;
  loading?: boolean;
}

function RechartsDiversityChart({ data }: DiversityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="pct"
          nameKey="name"
          cx="50%"
          cy="45%"
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
          formatter={(value: any, name: any) => [formatPercent(value, 1), name]}
          contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EChartsDiversityChart({ data }: DiversityChartProps) {
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {d}%',
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 13, color: '#7a7a7a' },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '45%'],
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
        <div className="w-8 h-8 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (props.data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-[#7a7a7a]">
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
