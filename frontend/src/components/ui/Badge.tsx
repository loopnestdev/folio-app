import { cn } from '../../lib/utils';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[#34c759]/15 text-[#1a7a2e]',
  danger: 'bg-[#ff3b30]/15 text-[#c0302a]',
  warning: 'bg-[#ff9500]/15 text-[#8a5200]',
  info: 'bg-[#0066cc]/15 text-[#0050a0]',
  neutral: 'bg-[#7a7a7a]/15 text-[#555555]',
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
