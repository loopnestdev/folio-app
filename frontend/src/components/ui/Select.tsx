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
        <label htmlFor={selectId} className="text-[15px] font-medium text-[#1d1d1f]">
          {label}
          {props.required && <span className="text-[#ff3b30] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full appearance-none border border-[#e0e0e0] rounded-xl bg-white text-[#1d1d1f]',
            'px-4 py-3 pr-10 text-[15px]',
            'focus:outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20',
            'disabled:bg-[#f5f5f7] disabled:text-[#7a7a7a] disabled:cursor-not-allowed',
            'transition-colors duration-150 cursor-pointer',
            error && 'border-[#ff3b30] focus:border-[#ff3b30] focus:ring-[#ff3b30]/20',
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
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#7a7a7a]">
          <ChevronDown size={18} />
        </div>
      </div>
      {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[#7a7a7a]">{hint}</p>}
    </div>
  );
}
