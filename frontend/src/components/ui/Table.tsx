import { useState, useMemo, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyField?: keyof T;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  footer?: ReactNode;
}

type SortDir = 'asc' | 'desc' | null;

function SortIcon({ direction }: { direction: SortDir }) {
  if (direction === 'asc') return <ChevronUp size={14} />;
  if (direction === 'desc') return <ChevronDown size={14} />;
  return <ChevronsUpDown size={14} className="opacity-40" />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  loading,
  emptyMessage = 'No data available',
  className,
  onRowClick,
  stickyHeader = false,
  footer,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortDir(null); setSortKey(null); }
      else setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const comparison = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDir]);

  return (
    <div className={cn('overflow-x-auto w-full', className)}>
      <table className="w-full border-collapse">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-[#e0e0e0]">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  'bg-white px-4 py-3 text-[13px] font-semibold text-[#7a7a7a] uppercase tracking-wide',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  col.sortable && 'cursor-pointer select-none hover:text-[#1d1d1f]',
                  col.className,
                )}
                onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <SortIcon direction={sortKey === String(col.key) ? sortDir : null} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-[#7a7a7a]">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#0066cc] border-t-transparent rounded-full animate-spin" />
                  <span>Loading...</span>
                </div>
              </td>
            </tr>
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-[#7a7a7a] text-[15px]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => (
              <tr
                key={keyField ? String(row[keyField]) : idx}
                className={cn(
                  'border-b border-[#f0f0f0] transition-colors',
                  idx % 2 === 1 && 'bg-[#f5f5f7]/50',
                  onRowClick && 'cursor-pointer hover:bg-[#f0f6ff]',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const rawValue = row[String(col.key)];
                  return (
                    <td
                      key={String(col.key)}
                      className={cn(
                        'px-4 py-3 text-[15px] text-[#1d1d1f]',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                        col.className,
                      )}
                    >
                      {col.render ? col.render(rawValue, row) : String(rawValue ?? '')}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-[#e0e0e0] font-semibold bg-[#f5f5f7]">
              {footer}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
