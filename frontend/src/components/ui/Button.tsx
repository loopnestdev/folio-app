import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--c-primary)] text-white hover:bg-[var(--c-primary-deep)] active:bg-[var(--c-primary-deep)] disabled:bg-[var(--c-primary)]/50',
  secondary:
    'bg-[var(--c-canvas)] text-[var(--c-primary)] border border-[var(--c-primary)] hover:bg-[var(--c-primary-bg)] active:bg-[var(--c-primary-bg)] disabled:opacity-50',
  ghost:
    'bg-transparent text-[var(--c-primary)] hover:bg-[var(--c-primary-bg)] active:bg-[var(--c-primary-bg)] disabled:opacity-50',
  danger:
    'bg-[var(--c-bear)] text-white hover:opacity-90 active:opacity-80 disabled:bg-[var(--c-bear)]/50',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-1.5 text-[15px] gap-1.5',
  md: 'px-[22px] py-[11px] text-[17px] gap-2',
  lg: 'px-8 py-4 text-[19px] gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-[9999px] transition-colors duration-150 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[var(--c-primary)] focus-visible:outline-offset-2',
        variantStyles[variant],
        sizeStyles[size],
        (disabled || loading) && 'cursor-not-allowed opacity-60',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="shrink-0">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0">{icon}</span>
      )}
    </button>
  );
}
