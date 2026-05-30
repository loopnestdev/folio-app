import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
  onChange?: (value: string) => void;
}

export function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  containerClassName,
  className,
  id,
  onChange,
  ...props
}: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-[15px] font-medium text-[var(--c-ink)]">
          {label}
          {props.required && <span className="text-[var(--c-bear)] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full appearance-none border border-[var(--c-border)] rounded-xl bg-[var(--c-canvas)] text-[var(--c-ink)]',
            'px-4 py-3 pr-10 text-[15px]',
            'focus:outline-none focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary-border)]',
            'disabled:bg-[var(--c-canvas-soft)] disabled:text-[var(--c-ink-mute)] disabled:cursor-not-allowed',
            'transition-colors duration-150 cursor-pointer',
            error && 'border-[var(--c-bear)] focus:border-[var(--c-bear)] focus:ring-[var(--c-bear-border)]',
            className,
          )}
          onChange={(e) => onChange?.(e.target.value)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-mute)]">
          <ChevronDown size={18} />
        </div>
      </div>
      {error && <p className="text-[13px] text-[var(--c-bear)]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[var(--c-ink-mute)]">{hint}</p>}
    </div>
  );
}
