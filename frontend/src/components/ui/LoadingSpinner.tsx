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
          'rounded-full border-[#e0e0e0] border-t-[#0066cc] animate-spin',
          sizeMap[size],
        )}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <p className="text-[15px] text-[#7a7a7a]">{label}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f5f5f7]/80 z-50">
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
