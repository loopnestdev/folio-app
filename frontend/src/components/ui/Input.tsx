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
        <label htmlFor={inputId} className="text-[15px] font-medium text-[var(--c-ink)]">
          {label}
          {props.required && <span className="text-[var(--c-bear)] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftAddon && (
          <div className="absolute left-3 text-[var(--c-ink-mute)] pointer-events-none">{leftAddon}</div>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full border border-[var(--c-border)] rounded-xl bg-[var(--c-canvas)] text-[var(--c-ink)] placeholder:text-[var(--c-ink-mute)]',
            'px-4 py-3 text-[15px]',
            'focus:outline-none focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary-border)]',
            'disabled:bg-[var(--c-canvas-soft)] disabled:text-[var(--c-ink-mute)] disabled:cursor-not-allowed',
            'transition-colors duration-150',
            error && 'border-[var(--c-bear)] focus:border-[var(--c-bear)] focus:ring-[var(--c-bear-border)]',
            !!leftAddon && 'pl-10',
            !!rightAddon && 'pr-10',
            className,
          )}
          {...props}
        />
        {rightAddon && (
          <div className="absolute right-3 text-[var(--c-ink-mute)]">{rightAddon}</div>
        )}
      </div>
      {error && <p className="text-[13px] text-[var(--c-bear)]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[var(--c-ink-mute)]">{hint}</p>}
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
        <label htmlFor={textareaId} className="text-[15px] font-medium text-[var(--c-ink)]">
          {label}
          {props.required && <span className="text-[var(--c-bear)] ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full border border-[var(--c-border)] rounded-xl bg-[var(--c-canvas)] text-[var(--c-ink)] placeholder:text-[var(--c-ink-mute)]',
          'px-4 py-3 text-[15px] resize-y min-h-[100px]',
          'focus:outline-none focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary-border)]',
          'transition-colors duration-150',
          error && 'border-[var(--c-bear)] focus:border-[var(--c-bear)] focus:ring-[var(--c-bear-border)]',
          className,
        )}
        {...props}
      />
      {error && <p className="text-[13px] text-[var(--c-bear)]">{error}</p>}
      {!error && hint && <p className="text-[13px] text-[var(--c-ink-mute)]">{hint}</p>}
    </div>
  );
}
