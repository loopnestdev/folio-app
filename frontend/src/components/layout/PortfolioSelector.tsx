import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Briefcase } from 'lucide-react';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { api } from '../../lib/api';
import type { Portfolio } from '../../types';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export function PortfolioSelector() {
  const { activePortfolio, setActivePortfolio, setPortfolios } = usePortfolioContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data } = await api.get<Portfolio[]>('/api/portfolios');
      return data;
    },
  });

  useEffect(() => {
    setPortfolios(portfolios);
    if (portfolios.length > 0 && !activePortfolio) {
      setActivePortfolio(portfolios[0]);
    }
    // Only run when portfolios changes, not on every activePortfolio change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-[15px] font-medium transition-colors',
          'text-white/90 hover:bg-white/10',
        )}
      >
        <Briefcase size={16} />
        <span className="max-w-[160px] truncate">
          {activePortfolio ? activePortfolio.name : 'Select Portfolio'}
        </span>
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-[#e0e0e0] rounded-[14px] shadow-lg overflow-hidden z-50">
          {portfolios.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-[#7a7a7a]">
              No portfolios yet
            </div>
          ) : (
            <div className="py-1">
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActivePortfolio(p); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-4 py-3 text-[15px] hover:bg-[#f5f5f7] transition-colors',
                    activePortfolio?.id === p.id && 'text-[#0066cc] font-medium',
                  )}
                >
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-[13px] text-[#7a7a7a] mt-0.5 truncate">{p.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-[#e0e0e0]">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/portfolios');
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-[15px] text-[#0066cc] hover:bg-[#f5f5f7] font-medium"
            >
              <Plus size={16} />
              Manage Portfolios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
