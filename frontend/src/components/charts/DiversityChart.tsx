import { useEffect, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactECharts from 'echarts-for-react';
import { useSettings } from '../../contexts/SettingsContext';
import type { DiversityAllocation } from '../../types';
import { CHART_COLORS } from '../../lib/utils';
import { layoutPieLabels, pieLabelHeight, pieLabelFit } from '../../lib/pieLabels';

interface DiversityChartProps {
  data: DiversityAllocation[];
  title?: string;
  loading?: boolean;
  /**
   * How slices are named:
   *   - 'legend' (default): a legend under the chart
   *   - 'slices': each slice's name and % beside it, joined by a line; the chart grows to fit them
   */
  labels?: 'legend' | 'slices';
}

const PAD_ANGLE = 2;
let _measureCtx: CanvasRenderingContext2D | null | undefined;
// Rendered width of each slice label (12px: semibold name, then regular %); falls back to ~7px a character without canvas
function labelWidths(data: DiversityAllocation[]): number[] {
  if (_measureCtx === undefined) {
    try { _measureCtx = document.createElement('canvas').getContext('2d'); } catch { _measureCtx = null; }
  }
  const ctx = _measureCtx;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  return data.map((d) => {
    const pct = ` ${d.pct.toFixed(1)}%`;
    if (!ctx) return (d.name.length + pct.length) * 7;
    ctx.font = `600 12px ${font}`;
    const name = ctx.measureText(d.name).width;
    ctx.font = `400 12px ${font}`;
    return Math.ceil(name + ctx.measureText(pct).width);
  });
}

// Width of the wrapper div, tracked as it resizes (0 until first measured)
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function RechartsDiversityChart({ data, labels = 'legend' }: DiversityChartProps) {
  const { ref, width } = useWidth();
  if (labels === 'slices') {
    const values = data.map((d) => d.pct);
    const height = pieLabelHeight(values, PAD_ANGLE, 300);
    const { r, cx } = pieLabelFit(width, values, PAD_ANGLE, labelWidths(data));
    const pos = layoutPieLabels(values, { cx, cy: height / 2, r, height, padAngle: PAD_ANGLE });
    return (
      <div ref={ref} style={{ height }}>
        {width > 0 && (
          <PieChart width={width} height={height}>
            <Pie
              data={data}
              dataKey="pct"
              nameKey="name"
              cx={cx}
              cy={height / 2}
              innerRadius={r * 0.6}
              outerRadius={r}
              startAngle={90}
              endAngle={-270}
              paddingAngle={PAD_ANGLE}
              labelLine={false}
              label={({ index }: { index?: number }) => {
                const d = data[index ?? 0];
                const p = pos[index ?? 0];
                if (!d || !p) return null;
                return (
                  <g>
                    <polyline points={p.points} fill="none" stroke={d.color || CHART_COLORS[(index ?? 0) % CHART_COLORS.length]} strokeWidth={1} />
                    <text x={p.x} y={p.y} textAnchor={p.anchor} dominantBaseline="central" fontSize={12}>
                      <tspan fill="var(--c-ink)" fontWeight={600}>{d.name}</tspan>
                      <tspan fill="var(--c-ink-mute)"> {d.pct.toFixed(1)}%</tspan>
                    </text>
                  </g>
                );
              }}
            >
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]} stroke="var(--c-canvas)" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
              contentStyle={{ borderRadius: 12, border: '1px solid var(--c-border)', fontSize: 13 }}
            />
          </PieChart>
        )}
      </div>
    );
  }

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
          paddingAngle={PAD_ANGLE}
        >
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
              stroke="var(--c-canvas)"
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
          contentStyle={{ borderRadius: 12, border: '1px solid var(--c-border)', fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EChartsDiversityChart({ data, labels = 'legend' }: DiversityChartProps) {
  const { ref, width } = useWidth();
  const sliced = labels === 'slices';
  const values = data.map((d) => d.pct);
  const height = sliced ? pieLabelHeight(values, PAD_ANGLE, 300) : 300;
  const { r, cx } = pieLabelFit(width, values, PAD_ANGLE, sliced ? labelWidths(data) : []);
  // ECharts draws to a canvas, which can't read CSS variables, so resolve the label colours now
  const style = getComputedStyle(document.documentElement);
  const ink     = style.getPropertyValue('--c-ink').trim()      || '#0d253d';
  const inkMute = style.getPropertyValue('--c-ink-mute').trim() || '#64748d';
  const font    = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const option = {
    tooltip: {
      trigger: 'item',
      // The slice's own pct (as Recharts shows), not its normalised share of the sum
      formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value.toFixed(1)}%`,
    },
    legend: {
      show: !sliced,
      bottom: 0,
      textStyle: { fontSize: 13, color: 'var(--c-ink-mute)' },
    },
    series: [
      {
        type: 'pie',
        radius: sliced ? [r * 0.6, r] : ['40%', '65%'],
        center: sliced ? [cx, '50%'] : ['50%', '45%'],
        padAngle: 3,
        data: data.map((d, idx) => ({
          name: d.name,
          value: d.pct,
          itemStyle: { color: d.color || CHART_COLORS[idx % CHART_COLORS.length] },
        })),
        // Outside labels with leader lines; ECharts shifts them apart where they would overlap
        label: sliced
          ? {
              show: true,
              position: 'outside',
              alignTo: 'labelLine',
              // pieLabelFit already sized the ring so each label fits, measured in the app font; don't let ECharts truncate
              overflow: 'none',
              formatter: (p: { name: string; value: number }) => `{n|${p.name}} {p|${p.value.toFixed(1)}%}`,
              rich: {
                n: { color: ink, fontWeight: 600, fontSize: 12, fontFamily: font },
                p: { color: inkMute, fontSize: 12, fontFamily: font },
              },
            }
          : { show: false },
        // Short enough that labels start within PIE_LABEL_GAP of the ring, where pieLabelFit left room for them
        labelLine: { show: sliced, length: 8, length2: 6 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
        },
      },
    ],
  };

  return (
    <div ref={ref}>
      {(!sliced || width > 0) && <ReactECharts option={option} style={{ height }} />}
    </div>
  );
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
