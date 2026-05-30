import type { ReactNode } from 'react';
import { cn, getValueColor } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  trend?: number; // positive = up, negative = down, 0/undefined = neutral
  trendLabel?: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  subtitle,
  icon,
  className,
  loading,
}: StatCardProps) {
  const trendColor = trend !== undefined ? getValueColor(trend) : 'var(--c-ink-mute)';
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        'bg-[var(--c-canvas)] rounded-[18px] border border-[var(--c-border)] p-6',
        className,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[13px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">{label}</p>
        {icon && <div className="text-[var(--c-ink-mute)]">{icon}</div>}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-32 bg-[var(--c-skeleton-base)] rounded animate-pulse" />
          <div className="h-4 w-20 bg-[var(--c-skeleton-base)] rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)] leading-tight">{value}</p>

          {(trend !== undefined || trendLabel) && (
            <div className="flex items-center gap-1.5 mt-2">
              <TrendIcon size={14} style={{ color: trendColor }} />
              <span className="text-[13px] font-medium" style={{ color: trendColor }}>
                {trendLabel || (trend !== undefined ? `${trend >= 0 ? '+' : ''}${trend.toFixed(2)}%` : '')}
              </span>
            </div>
          )}

          {subtitle && (
            <p className="text-[13px] text-[var(--c-ink-mute)] mt-1">{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}
