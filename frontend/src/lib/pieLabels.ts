// Outside labels for a donut: each slice's name sits in a column left or right of the ring, joined by an elbow line.
// The layout is for the Recharts pie, which (unlike ECharts) has no overlap avoidance for outside labels; both use the sizing.

export const PIE_LABEL_LINE_H = 16;
export const PIE_LABEL_GAP = 20; // ring edge to label column
const PIE_PAD_Y = 14;

/**
 * sliceMidAngles:
 *   - Mid angle of each slice in degrees, measured clockwise from 12 o'clock
 *   - Mirrors Recharts' layout: the sweep left after padding is shared by value, with a pad between slices
 */
export function sliceMidAngles(values: number[], padAngle: number): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const sweep = 360 - values.length * padAngle;
  let cursor = 0;
  return values.map((v, i) => {
    if (i > 0) cursor += padAngle;
    const angle = (sweep * v) / total;
    const mid = cursor + angle / 2;
    cursor += angle;
    return mid;
  });
}

const onRight = (mid: number) => mid <= 180;

/** Chart height that fits every label on the busier side without overlap (at least `min`). */
export function pieLabelHeight(values: number[], padAngle: number, min: number): number {
  const mids = sliceMidAngles(values, padAngle);
  const right = mids.filter(onRight).length;
  const busiest = Math.max(right, mids.length - right);
  return Math.max(min, busiest * PIE_LABEL_LINE_H + 2 * PIE_PAD_Y);
}

/**
 * pieLabelFit:
 *   - Ring radius (32-100px) and centre x that leave room for the widest label on each side
 *   - The ring shifts off-centre when one side's labels are wider (e.g. "Unallocated" near 12 o'clock sits on the left)
 *   - `labelWidths` are the rendered label widths in px, one per slice
 */
export function pieLabelFit(width: number, values: number[], padAngle: number, labelWidths: number[]): { r: number; cx: number } {
  const mids = sliceMidAngles(values, padAngle);
  const widest = (right: boolean) => Math.max(0, ...labelWidths.filter((_, i) => onRight(mids[i]) === right));
  const leftW = widest(false);
  const rightW = widest(true);
  const side = PIE_LABEL_GAP + 4;
  const r = Math.max(32, Math.min(100, (width - leftW - rightW - 2 * side) / 2));
  const slack = Math.max(0, width - (leftW + rightW + 2 * side + 2 * r));
  return { r, cx: leftW + side + r + slack / 2 };
}

export interface PieLabelPos {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  /** SVG polyline points: ring edge, elbow, label column */
  points: string;
}

/**
 * layoutPieLabels:
 *   - Each label starts level with its slice's midpoint, then labels on the same side are pushed apart to one line height
 *   - If the pushed column overruns the bottom it is shifted back up, so it always fits within the chart height
 */
export function layoutPieLabels(
  values: number[],
  o: { cx: number; cy: number; r: number; height: number; padAngle: number },
): PieLabelPos[] {
  const mids = sliceMidAngles(values, o.padAngle);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const at = (deg: number, r: number) => ({ x: o.cx + r * Math.sin(rad(deg)), y: o.cy - r * Math.cos(rad(deg)) });
  const ys = mids.map((m) => at(m, o.r + 12).y);

  const minY = PIE_PAD_Y;
  const maxY = o.height - PIE_PAD_Y;
  for (const right of [true, false]) {
    const idx = mids.map((_, i) => i).filter((i) => onRight(mids[i]) === right).sort((a, b) => ys[a] - ys[b]);
    for (let k = 0; k < idx.length; k++) {
      ys[idx[k]] = Math.max(ys[idx[k]], k === 0 ? minY : ys[idx[k - 1]] + PIE_LABEL_LINE_H);
    }
    for (let k = idx.length - 1; k >= 0; k--) {
      ys[idx[k]] = Math.min(ys[idx[k]], k === idx.length - 1 ? maxY : ys[idx[k + 1]] - PIE_LABEL_LINE_H);
    }
  }

  return mids.map((m, i) => {
    const right = onRight(m);
    const edge = at(m, o.r + 2);
    const elbow = at(m, o.r + 12);
    const colX = o.cx + (right ? 1 : -1) * (o.r + PIE_LABEL_GAP);
    const y = ys[i];
    return {
      x: colX + (right ? 4 : -4),
      y,
      anchor: right ? 'start' : 'end',
      points: `${edge.x},${edge.y} ${elbow.x},${elbow.y} ${colX},${y}`,
    };
  });
}
