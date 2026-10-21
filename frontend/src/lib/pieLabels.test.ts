import { describe, it, expect } from 'vitest';
import { sliceMidAngles, pieLabelHeight, pieLabelFit, layoutPieLabels, PIE_LABEL_LINE_H, PIE_LABEL_GAP } from './pieLabels';

describe('sliceMidAngles', () => {
  it('measures clockwise from 12 o\'clock, sharing the sweep left after padding', () => {
    expect(sliceMidAngles([50, 50], 0)).toEqual([90, 270]);
    // 2 slices x 10deg pad leaves 340deg: first spans 0-170, second 180-350
    expect(sliceMidAngles([50, 50], 10)).toEqual([85, 265]);
  });

  it('returns zeros when every value is zero', () => {
    expect(sliceMidAngles([0, 0], 2)).toEqual([0, 0]);
  });
});

describe('pieLabelHeight', () => {
  it('keeps the minimum for a few slices', () => {
    expect(pieLabelHeight([40, 30, 30], 2, 300)).toBe(300);
  });

  it('grows to fit the busier side', () => {
    const many = Array.from({ length: 50 }, () => 2);
    expect(pieLabelHeight(many, 0, 300)).toBe(25 * PIE_LABEL_LINE_H + 28);
  });
});

describe('pieLabelFit', () => {
  // Two halves: slice 0 labels on the right, slice 1 on the left
  const halves = [50, 50];
  const side = PIE_LABEL_GAP + 4;

  it('centres a 100px ring when there is room to spare', () => {
    expect(pieLabelFit(800, halves, 0, [80, 80])).toEqual({ r: 100, cx: 400 });
  });

  it('shrinks the ring and shifts it away from the wider side on narrow widths', () => {
    const { r, cx } = pieLabelFit(311, halves, 0, [80, 115]);
    expect(r).toBe((311 - 195 - 2 * side) / 2);
    expect(cx - r - side).toBe(115); // left label column fits exactly
    expect(311 - (cx + r + side)).toBeCloseTo(80); // and so does the right
  });

  it('never goes below a 32px ring', () => {
    expect(pieLabelFit(150, halves, 0, [80, 80]).r).toBe(32);
  });
});

describe('layoutPieLabels', () => {
  const o = { cx: 200, cy: 150, r: 100, height: 300, padAngle: 0 };

  it('puts right-half slices on the right (anchor start) and the rest on the left', () => {
    const [a, b] = layoutPieLabels([50, 50], o);
    expect(a.anchor).toBe('start');
    expect(a.x).toBeGreaterThan(o.cx + o.r);
    expect(b.anchor).toBe('end');
    expect(b.x).toBeLessThan(o.cx - o.r);
  });

  it('keeps labels on one side at least a line apart and inside the chart', () => {
    const many = Array.from({ length: 30 }, () => 1);
    const pos = layoutPieLabels(many, { ...o, height: pieLabelHeight(many, 0, 300) });
    for (const right of ['start', 'end']) {
      const ys = pos.filter((p) => p.anchor === right).map((p) => p.y).sort((a, b) => a - b);
      ys.forEach((y, i) => {
        expect(y).toBeGreaterThanOrEqual(0);
        if (i > 0) expect(y - ys[i - 1]).toBeGreaterThanOrEqual(PIE_LABEL_LINE_H - 1e-9);
      });
    }
  });

  it('ends each leader line at the label column, level with the label', () => {
    const [p] = layoutPieLabels([100], o);
    const last = p.points.split(' ').pop()!.split(',').map(Number);
    expect(last).toEqual([o.cx + o.r + PIE_LABEL_GAP, p.y]);
  });
});
