import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullPage?: boolean;
  label?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export function LoadingSpinner({ size = 'md', className, fullPage, label }: LoadingSpinnerProps) {
  const spinner = (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full border-[var(--c-border)] border-t-[var(--c-primary)] animate-spin',
          sizeMap[size],
        )}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <p className="text-[15px] text-[var(--c-ink-mute)]">{label}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--c-canvas-soft)]/80 z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
