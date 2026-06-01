import { useState } from 'react';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { useGroups } from './useGroups';

/**
 * Manages the Individual / Group view-mode toggle for report pages.
 *
 * - In 'individual' mode: returns the active portfolio's ID and currency.
 * - In 'group'      mode: returns the selected group's ID and base_currency.
 *
 * Pass portfolioId and groupId (whichever is non-undefined) to your data hooks.
 * The hooks themselves use `enabled: !!id` so only the active mode fetches data.
 */
export function useReportViewSwitcher(paramId?: string) {
  const { activePortfolio, portfolios } = usePortfolioContext();
  const { data: groups = [] } = useGroups();

  const [viewMode, setViewMode]                 = useState<'individual' | 'group'>('group');
  const [overridePortfolioId, setOverridePortfolioId] = useState<string | undefined>();
  const [selectedGroupId, setSelectedGroupId]   = useState<string | undefined>();

  // Effective IDs — paramId from useParams takes priority over activePortfolio
  const effectivePortfolioId = overridePortfolioId ?? paramId ?? activePortfolio?.id;

  // For group mode: prefer the group the current portfolio belongs to
  const relatedGroupId = groups.find((g) => g.id === activePortfolio?.group_id)?.id
                      ?? (groups.length > 0 ? groups[0].id : undefined);
  const effectiveGroupId = selectedGroupId ?? relatedGroupId;

  const currentPortfolio = portfolios.find((p) => p.id === effectivePortfolioId);
  const currentGroup     = groups.find((g) => g.id === effectiveGroupId);

  const currency    = viewMode === 'group'
    ? (currentGroup?.base_currency ?? 'AUD')
    : (currentPortfolio?.currency  ?? 'AUD');

  const displayName = viewMode === 'group'
    ? (currentGroup?.name  ?? '')
    : (currentPortfolio?.name ?? '');

  const handleViewModeChange = (mode: 'individual' | 'group') => {
    setViewMode(mode);
    // Auto-select the best group when first switching to group mode
    if (mode === 'group' && !selectedGroupId && relatedGroupId) {
      setSelectedGroupId(relatedGroupId);
    }
  };

  return {
    viewMode,
    // Pass these to your hooks — undefined disables the query for the inactive mode
    portfolioId: viewMode === 'individual' ? effectivePortfolioId : undefined,
    groupId:     viewMode === 'group'      ? effectiveGroupId      : undefined,
    currency,
    displayName,
    hasGroups: groups.length > 0,
    // For passing to <ReportViewSwitcher />
    portfolios,
    groups,
    activePortfolioId: effectivePortfolioId,
    activeGroupId:     effectiveGroupId,
    onViewModeChange:  handleViewModeChange,
    onPortfolioChange: setOverridePortfolioId,
    onGroupChange:     setSelectedGroupId,
  };
}
