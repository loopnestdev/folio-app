import type { Portfolio, PortfolioGroup } from '../../types';
import { cn } from '../../lib/utils';

interface ReportViewSwitcherProps {
  viewMode: 'individual' | 'group';
  portfolios: Portfolio[];
  groups: PortfolioGroup[];
  activePortfolioId?: string;
  activeGroupId?: string;
  onViewModeChange: (mode: 'individual' | 'group') => void;
  onPortfolioChange: (id: string) => void;
  onGroupChange: (id: string) => void;
}

/**
 * Pill toggle shown on every report page when the user belongs to at least one group.
 * Switching to "Group" aggregates data across all portfolios in the selected group.
 */
export function ReportViewSwitcher({
  viewMode,
  portfolios,
  groups,
  activePortfolioId,
  activeGroupId,
  onViewModeChange,
  onPortfolioChange,
  onGroupChange,
}: ReportViewSwitcherProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Mode toggle */}
      <div className="flex items-center bg-[var(--c-canvas-soft)] rounded-full p-1 gap-0.5">
        <button
          onClick={() => onViewModeChange('individual')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors',
            viewMode === 'individual'
              ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
              : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]',
          )}
        >
          Individual
        </button>
        <button
          onClick={() => onViewModeChange('group')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors',
            viewMode === 'group'
              ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
              : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]',
          )}
        >
          Group
        </button>
      </div>

      {/* Entity selector */}
      {viewMode === 'individual' ? (
        <select
          value={activePortfolioId ?? ''}
          onChange={(e) => onPortfolioChange(e.target.value)}
          className="text-[13px] font-medium bg-[var(--c-canvas-soft)] border border-[var(--c-border)] rounded-full px-3 py-1.5 text-[var(--c-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--c-primary-border)] cursor-pointer"
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <select
          value={activeGroupId ?? ''}
          onChange={(e) => onGroupChange(e.target.value)}
          className="text-[13px] font-medium bg-[var(--c-canvas-soft)] border border-[var(--c-border)] rounded-full px-3 py-1.5 text-[var(--c-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--c-primary-border)] cursor-pointer"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
