import type { ReactNode } from 'react';
import { cn, getValueColor } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  trend?: number; // positive = up, negative = down, 0/undefined = neutral
  trendLabel?: string;
  subtitle?: string;
  /** Short explanation shown in a hover tooltip next to the label. */
  tooltip?: string;
  /** Optional content rendered below the value area, separated by a divider. */
  footer?: ReactNode;
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
  tooltip,
  footer,
  icon,
  className,
  loading,
}: StatCardProps) {
  const trendColor = trend !== undefined ? getValueColor(trend) : 'var(--c-ink-mute)';
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        'bg-[var(--c-canvas)] rounded-[18px] border border-[var(--c-border)] p-6 flex flex-col',
        className,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">{label}</p>
          {tooltip && (
            <div className="relative group/tooltip">
              <Info
                size={12}
                className="text-[var(--c-ink-mute)] opacity-50 hover:opacity-100 cursor-help transition-opacity mt-px shrink-0"
              />
              {/* Tooltip bubble — floats above the icon */}
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
                              hidden group-hover/tooltip:block
                              w-64 p-3 rounded-[12px] shadow-lg
                              bg-[var(--c-canvas)] border border-[var(--c-border)]
                              text-[12px] text-[var(--c-ink-mute)] leading-relaxed whitespace-normal">
                {tooltip}
                {/* Arrow pointing down */}
                <div className="absolute top-full left-1/2 -translate-x-1/2
                                border-4 border-transparent border-t-[var(--c-border)]" />
              </div>
            </div>
          )}
        </div>
        {icon && <div className="text-[var(--c-ink-mute)]">{icon}</div>}
      </div>

      {loading ? (
        <div className="space-y-2 flex-1">
          <div className="h-7 w-32 bg-[var(--c-skeleton-base)] rounded animate-pulse" />
          <div className="h-4 w-20 bg-[var(--c-skeleton-base)] rounded animate-pulse" />
        </div>
      ) : (
        <div className="flex-1">
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
        </div>
      )}

      {footer && !loading && (
        <div className="mt-3 pt-3 border-t border-[var(--c-border)]">
          {footer}
        </div>
      )}
    </div>
  );
}
