import { cn } from '../../lib/utils';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--c-bull-bg)] text-[var(--c-bull)]',
  danger:  'bg-[var(--c-bear-bg)] text-[var(--c-bear)]',
  warning: 'bg-[var(--c-warn-bg)] text-[var(--c-warn)]',
  info:    'bg-[var(--c-primary-bg)] text-[var(--c-primary)]',
  neutral: 'bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)]',
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Convenience exports
export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, BadgeVariant> = {
    approved: 'success',
    pending: 'warning',
    rejected: 'danger',
    admin: 'info',
    standard: 'neutral',
  };
  return <Badge variant={variantMap[status] || 'neutral'}>{status}</Badge>;
}
