import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
  containerClassName?: string;
}

export function Input({
  label,
  error,
  hint,
  leftAddon,
  rightAddon,
  containerClassName,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-[15px] font-medium text-[#1d1d1f]">
          {label}
          {props.required && <span className="text-[#ff3b30] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftAddon && (
          <div className="absolute left-3 text-[#7a7a7a] pointer-events-none">{leftAddon}</div>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full border border-[#e0e0e0] rounded-xl bg-white text-[#1d1d1f] placeholder:text-[#7a7a7a]',
            'px-4 py-3 text-[15px]',
            'focus:outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20',
            'disabled:bg-[#f5f5f7] disabled:text-[#7a7a7a] disabled:cursor-not-allowed',
            'transition-colors duration-150',
            error && 'border-[#ff3b30] focus:border-[#ff3b30] focus:ring-[#ff3b30]/20',
            !!leftAddon && 'pl-10',
            !!rightAddon && 'pr-10',
            className,
          )}
          {...props}
        />
        {rightAddon && (
          <div className="absolute right-3 text-[#7a7a7a]">{rightAddon}</div>
        )}
      </div>
      {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[#7a7a7a]">{hint}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export function Textarea({ label, error, hint, containerClassName, className, id, ...props }: TextareaProps) {
  const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className="text-[15px] font-medium text-[#1d1d1f]">
          {label}
          {props.required && <span className="text-[#ff3b30] ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full border border-[#e0e0e0] rounded-xl bg-white text-[#1d1d1f] placeholder:text-[#7a7a7a]',
          'px-4 py-3 text-[15px] resize-y min-h-[100px]',
          'focus:outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/20',
          'transition-colors duration-150',
          error && 'border-[#ff3b30] focus:border-[#ff3b30] focus:ring-[#ff3b30]/20',
          className,
        )}
        {...props}
      />
      {error && <p className="text-[13px] text-[#ff3b30]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[#7a7a7a]">{hint}</p>}
    </div>
  );
}
