import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

const paddingMap = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ children, className, padding = 'md' }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--c-canvas)] rounded-[18px] border border-[var(--c-border)]',
        paddingMap[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-5', className)}>
      <div>
        <h2 className="text-[22px] font-semibold text-[var(--c-ink)] tracking-tight">{title}</h2>
        {subtitle && <p className="text-[15px] text-[var(--c-ink-mute)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}

export function CardDivider() {
  return <hr className="border-t border-[var(--c-border)] my-4" />;
}
