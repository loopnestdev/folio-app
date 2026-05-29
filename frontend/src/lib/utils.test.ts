import { describe, it, expect } from 'vitest';
import {
  cn,
  formatCurrency,
  formatPercent,
  formatDate,
  formatNumber,
  getValueColor,
  getValueColorClass,
  truncate,
  dateRangeToParams,
} from './utils';

describe('cn()', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters falsy values', () => {
    expect(cn('foo', null, undefined, false, '')).toBe('foo');
  });

  it('handles object syntax', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles nested arrays', () => {
    expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
  });
});

describe('formatCurrency()', () => {
  it('formats USD', () => {
    const result = formatCurrency(1234.56, 'USD');
    expect(result).toContain('1,234.56');
    expect(result).toContain('$');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'USD')).toContain('0.00');
  });

  it('formats negative values', () => {
    const result = formatCurrency(-500, 'USD');
    expect(result).toContain('500.00');
  });
});

describe('formatPercent()', () => {
  it('adds + for positive values', () => {
    expect(formatPercent(5.5)).toBe('+5.50%');
  });

  it('does not add + for negative values', () => {
    expect(formatPercent(-3.2)).toBe('-3.20%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });

  it('respects decimal places', () => {
    expect(formatPercent(1.23456, 1)).toBe('+1.2%');
  });
});

describe('formatDate()', () => {
  it('formats a date string', () => {
    const result = formatDate('2024-01-15', 'medium');
    expect(result).toContain('2024');
    expect(result).toContain('Jan');
  });

  it('formats short date', () => {
    const result = formatDate('2024-06-01', 'short');
    expect(result).toContain('Jun');
    expect(result).not.toContain('2024');
  });

  it('formats long date', () => {
    const result = formatDate('2024-03-20', 'long');
    expect(result).toContain('2024');
    expect(result).toContain('March');
    expect(result).toContain('20');
  });
});

describe('formatNumber()', () => {
  it('formats with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats with decimals', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });
});

describe('getValueColor()', () => {
  it('returns success color for positive', () => {
    expect(getValueColor(1)).toBe('var(--color-success)');
  });

  it('returns danger color for negative', () => {
    expect(getValueColor(-1)).toBe('var(--color-danger)');
  });

  it('returns muted color for zero', () => {
    expect(getValueColor(0)).toBe('var(--color-muted)');
  });
});

describe('getValueColorClass()', () => {
  it('returns text-positive for positive', () => {
    expect(getValueColorClass(5)).toBe('text-positive');
  });

  it('returns text-negative for negative', () => {
    expect(getValueColorClass(-5)).toBe('text-negative');
  });

  it('returns empty string for zero', () => {
    expect(getValueColorClass(0)).toBe('');
  });
});

describe('truncate()', () => {
  it('truncates long strings', () => {
    expect(truncate('Hello world', 5)).toBe('Hello…');
  });

  it('does not truncate short strings', () => {
    expect(truncate('Hi', 5)).toBe('Hi');
  });

  it('does not truncate strings equal to max length', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });
});

describe('dateRangeToParams()', () => {
  it('returns valid date params for 1Y range', () => {
    const { start_date, end_date } = dateRangeToParams('1Y');
    expect(start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(start_date) < new Date(end_date)).toBe(true);
  });

  it('returns valid date params for YTD', () => {
    const { start_date } = dateRangeToParams('YTD');
    const year = new Date().getFullYear();
    expect(start_date.startsWith(String(year))).toBe(true);
  });

  it('uses custom dates for CUSTOM range', () => {
    const { start_date, end_date } = dateRangeToParams('CUSTOM', '2023-01-01', '2023-12-31');
    expect(start_date).toBe('2023-01-01');
    expect(end_date).toBe('2023-12-31');
  });
});
