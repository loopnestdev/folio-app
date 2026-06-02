import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Briefcase, Layers } from 'lucide-react';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useGroups } from '../../hooks/useGroups';
import { api } from '../../lib/api';
import type { Portfolio } from '../../types';
import { cn } from '../../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';

export function PortfolioSelector() {
  const { activePortfolio, setActivePortfolio, setPortfolios } = usePortfolioContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data } = await api.get<Portfolio[]>('/api/portfolios');
      return data;
    },
  });

  const { data: groups = [] } = useGroups();

  useEffect(() => {
    setPortfolios(portfolios);
    if (portfolios.length > 0 && !activePortfolio) {
      setActivePortfolio(portfolios[0]);
    }
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

  const selectPortfolio = (p: Portfolio) => {
    setActivePortfolio(p);
    setOpen(false);
    // If the current page is a portfolio-specific route (/portfolios/:id/...),
    // navigate to the same sub-path for the newly selected portfolio so that the
    // URL (and therefore useParams) stays consistent with the active portfolio.
    // Without this, pages read the stale :id from the URL while the subtitle
    // updates from context — data never re-fetches for the new portfolio.
    const match = location.pathname.match(/^\/portfolios\/[^/]+(.*)/);
    if (match) {
      navigate(`/portfolios/${p.id}${match[1]}`);
    }
  };

  // Compute grouped and ungrouped lists
  const groupedPortfolioIds = new Set(
    groups.flatMap((g) => (g.portfolios ?? []).map((p) => p.id)),
  );
  const ungrouped = portfolios.filter((p) => !p.group_id || !groupedPortfolioIds.has(p.id));

  const hasGroups = groups.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-[15px] font-medium transition-colors',
          'text-[var(--c-ink-mute)] hover:bg-[var(--c-canvas-soft)] hover:text-[var(--c-ink)]',
        )}
      >
        <Briefcase size={16} />
        <span className="max-w-[160px] truncate">
          {activePortfolio ? activePortfolio.name : 'Select Portfolio'}
        </span>
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-[14px] shadow-lg overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {portfolios.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-[var(--c-ink-mute)]">
              No portfolios yet
            </div>
          ) : hasGroups ? (
            // ── Grouped view ──────────────────────────────
            <div className="py-1">
              {groups.map((group) => {
                const gPortfolios = portfolios.filter((p) => p.group_id === group.id);
                if (gPortfolios.length === 0) return null;
                return (
                  <div key={group.id}>
                    {/* Group label */}
                    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                      <Layers size={12} className="text-[var(--c-ink-mute)]" />
                      <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-widest">
                        {group.name}
                      </span>
                    </div>
                    {gPortfolios.map((p) => (
                      <PortfolioOption
                        key={p.id}
                        portfolio={p}
                        active={activePortfolio?.id === p.id}
                        onSelect={selectPortfolio}
                        indented
                      />
                    ))}
                  </div>
                );
              })}

              {/* Ungrouped portfolios */}
              {ungrouped.length > 0 && (
                <div>
                  {groups.length > 0 && (
                    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                      <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-widest">
                        Ungrouped
                      </span>
                    </div>
                  )}
                  {ungrouped.map((p) => (
                    <PortfolioOption
                      key={p.id}
                      portfolio={p}
                      active={activePortfolio?.id === p.id}
                      onSelect={selectPortfolio}
                      indented={groups.length > 0}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // ── Flat view (no groups) ─────────────────────
            <div className="py-1">
              {portfolios.map((p) => (
                <PortfolioOption
                  key={p.id}
                  portfolio={p}
                  active={activePortfolio?.id === p.id}
                  onSelect={selectPortfolio}
                />
              ))}
            </div>
          )}

          <div className="border-t border-[var(--c-border)]">
            <button
              onClick={() => { setOpen(false); navigate('/portfolios'); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-[15px] text-[var(--c-primary)] hover:bg-[var(--c-canvas-soft)] font-medium"
            >
              <Plus size={16} />
              Manage Portfolios &amp; Groups
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────
function PortfolioOption({
  portfolio,
  active,
  onSelect,
  indented = false,
}: {
  portfolio: Portfolio;
  active: boolean;
  onSelect: (p: Portfolio) => void;
  indented?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(portfolio)}
      className={cn(
        'w-full text-left py-2.5 text-[15px] hover:bg-[var(--c-canvas-soft)] transition-colors',
        indented ? 'pl-8 pr-4' : 'px-4',
        active && 'text-[var(--c-primary)] font-medium',
      )}
    >
      <div className="font-medium truncate">{portfolio.name}</div>
      <div className="text-[12px] text-[var(--c-ink-mute)] mt-0.5">{portfolio.currency}</div>
    </button>
  );
}
