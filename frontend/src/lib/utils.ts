// ClassValue type for cn() helper
type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

// cn() helper - combine class names
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      classes.push(input);
    } else if (Array.isArray(input)) {
      const result = cn(...input);
      if (result) classes.push(result);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }
  return classes.join(' ');
}

// Format currency
export function formatCurrency(
  value: number,
  currency = 'USD',
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

// Format percentage
export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// Format date
export function formatDate(date: string | Date, format: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions =
    format === 'short'
      ? { month: 'short', day: 'numeric' }
      : format === 'long'
        ? { year: 'numeric', month: 'long', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(d);
}

// Format number with commas
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// Format large numbers (K, M, B)
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

// Get color class based on positive/negative value
export function getValueColorClass(value: number): string {
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-negative';
  return '';
}

// Get color style based on positive/negative value
export function getValueColor(value: number): string {
  if (value > 0) return 'var(--c-bull)';
  if (value < 0) return 'var(--c-bear)';
  return 'var(--c-ink-mute)';
}

// Calculate date range
export function getDateRange(range: string, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const end = new Date();
  let start = new Date();

  switch (range) {
    case 'YTD':
      start = new Date(end.getFullYear(), 0, 1);
      break;
    case '1Y':
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case '2Y':
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 2);
      break;
    case '3Y':
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 3);
      break;
    case '5Y':
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 5);
      break;
    case 'ALL':
      start = new Date('2000-01-01');
      break;
    case 'CUSTOM':
      if (customStart) {
        start = new Date(customStart);
      } else {
        start = new Date(end);
        start.setFullYear(start.getFullYear() - 1);
      }
      return { start, end: customEnd ? new Date(customEnd) : end };
    default:
      start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
  }

  return { start, end };
}

function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Format date range for API
export function dateRangeToParams(range: string, customStart?: string, customEnd?: string) {
  const { start, end } = getDateRange(range, customStart, customEnd);
  return {
    start_date: toLocalDate(start),
    end_date: toLocalDate(end),
  };
}

// Trigger a browser download for an in-memory file (e.g. an export response's Blob).
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Truncate string
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}

// Debounce
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: TArgs) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Generate chart colors — Stripe palette
export const CHART_COLORS = [
  '#533afd',
  '#059669',
  '#d97706',
  '#ea2261',
  '#5856d6',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#16a34a',
  '#b45309',
];

// Month names
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
