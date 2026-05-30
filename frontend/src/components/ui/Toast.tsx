import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-[var(--c-bull)]" />,
  error:   <AlertCircle size={18} className="text-[var(--c-bear)]" />,
  info:    <Info size={18} className="text-[var(--c-primary)]" />,
  warning: <AlertTriangle size={18} className="text-[var(--c-warn)]" />,
};

const variantBorder: Record<ToastVariant, string> = {
  success: 'border-l-[var(--c-bull)]',
  error:   'border-l-[var(--c-bear)]',
  info:    'border-l-[var(--c-primary)]',
  warning: 'border-l-[var(--c-warn)]',
};

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  useEffect(() => {
    const duration = item.duration ?? 4000;
    if (duration > 0) {
      const t = setTimeout(() => onRemove(item.id), duration);
      return () => clearTimeout(t);
    }
  }, [item.id, item.duration, onRemove]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 bg-[var(--c-canvas)] border border-[var(--c-border)] border-l-4 rounded-[14px] px-4 py-3 shadow-lg max-w-sm w-full',
        variantBorder[item.variant],
        'animate-[fadeInRight_0.2s_ease-out]',
      )}
      role="alert"
    >
      <span className="shrink-0 mt-0.5">{icons[item.variant]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-[var(--c-ink)]">{item.title}</p>
        {item.message && <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5">{item.message}</p>}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((opts: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { ...opts, id }]);
  }, []);

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (title, message) => addToast({ variant: 'success', title, message }),
    error: (title, message) => addToast({ variant: 'error', title, message }),
    info: (title, message) => addToast({ variant: 'info', title, message }),
    warning: (title, message) => addToast({ variant: 'warning', title, message }),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem item={t} onRemove={removeToast} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
