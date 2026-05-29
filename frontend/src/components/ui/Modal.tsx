import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({ open, onClose, title, children, size = 'md', className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        className={cn(
          'relative w-full bg-white rounded-[18px] border border-[#e0e0e0] overflow-hidden shadow-xl',
          sizeStyles[size],
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
            <h3 id="modal-title" className="text-[19px] font-semibold text-[#1d1d1f]">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-[#7a7a7a] hover:text-[#1d1d1f] transition-colors rounded-full p-1"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}
        {/* Content */}
        <div className={cn(!title && 'pt-6', 'px-6 pb-6')}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 mt-6 pt-5 border-t border-[#e0e0e0]', className)}>
      {children}
    </div>
  );
}
