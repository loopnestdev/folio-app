import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, LogOut, AlertTriangle } from 'lucide-react';
import { useRebalance, useTargetPortfolio } from '../../hooks/useTargetPortfolios';
import { useTargetPortfolioGroup } from '../../hooks/useTargetPortfolioGroups';
import { usePortfolios } from '../../hooks/usePortfolio';
import { useGroups } from '../../hooks/useGroups';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';
import type { RebalanceAction, TaxTier, RebalanceRow, RebalanceBase, RebalanceComparisonRef } from '../../types';

type Money = (v: number) => string;

// ── Action badge ──────────────────────────────────────────────
function ActionBadge({ action }: { action: RebalanceAction }) {
  const cfg: Record<RebalanceAction, { label: string; icon: React.ReactNode; className: string }> = {
    BUY:  { label: 'BUY',  icon: <TrendingUp  size={11} />, className: 'bg-[var(--c-bull-bg)] text-[var(--c-bull)]' },
    SELL: { label: 'SELL', icon: <TrendingDown size={11} />, className: 'bg-[var(--c-bear-bg)] text-[var(--c-bear)]' },
    HOLD: { label: 'HOLD', icon: <Minus        size={11} />, className: 'bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)]' },
    EXIT: { label: 'EXIT', icon: <LogOut       size={11} />, className: 'bg-[var(--c-warn-bg)] text-[var(--c-warn)]' },
  };
  const { label, icon, className } = cfg[action];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${className}`}>
      {icon} {label}
    </span>
  );
}

// ── Tax tier badge ────────────────────────────────────────────
function TaxBadge({ tier, stGain, ltGain, money }: { tier: TaxTier; stGain: number; ltGain: number; money: Money }) {
  if (tier === 'none') return null;
  const totalGain = stGain + ltGain;
  if (tier === 'loss') {
    return <span className="text-[12px] text-[var(--c-bull)] font-medium">Loss ({money(totalGain)})</span>;
  }
  if (tier === 'long_term') {
    return (
      <span className="text-[12px] text-[var(--c-primary)] font-medium" title="CGT discount eligible (≥365 days)">
        LT gain {money(totalGain)}
      </span>
    );
  }
  return (
    <span className="text-[12px] text-[var(--c-bear)] font-medium" title="Short-term — no CGT discount">
      ST gain {money(totalGain)}
    </span>
  );
}

// Effective target % can have several decimals for a group (weight x stock %)
const fmtPct = (v: number) => `${Number(v.toFixed(2))}%`;

/** Which target portfolios a group row's allocation comes from */
function Sources({ row }: { row: RebalanceRow }) {
  if (!row.sources?.length) return null;
  return (
    <p className="text-[11px] text-[var(--c-ink-mute)] break-words">
      {row.sources.map((s) => `${s.name} ${s.weight_pct}% × ${s.item_pct}%`).join(' + ')}
    </p>
  );
}

const diffClass = (diff: number) =>
  diff > 0 ? 'text-[var(--c-bull)]' : diff < 0 ? 'text-[var(--c-bear)]' : 'text-[var(--c-ink-mute)]';

// ── Phone layout for one row: the 8-column table does not fit, so each holding is a small card ──
function RebalanceRowCard({ row, money, showSources }: { row: RebalanceRow; money: Money; showSources: boolean }) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-[var(--c-primary)]">{row.symbol}</span>
          {row.category && <span className="ml-2 text-[12px] text-[var(--c-ink-mute)]">{row.category}</span>}
          {showSources && <Sources row={row} />}
        </div>
        <ActionBadge action={row.action} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] tnum">
        <dt className="text-[var(--c-ink-mute)]">Target</dt>
        <dd className="text-right text-[var(--c-ink)]">
          {row.allocation_pct > 0 ? `${fmtPct(row.allocation_pct)} · ${money(row.target_value)}` : '—'}
        </dd>
        <dt className="text-[var(--c-ink-mute)]">Current</dt>
        <dd className="text-right text-[var(--c-ink)]">{money(row.current_value)}</dd>
        <dt className="text-[var(--c-ink-mute)]">Difference</dt>
        <dd className={`text-right font-medium ${diffClass(row.diff)}`}>
          {row.diff > 0 ? '+' : ''}{money(row.diff)}
        </dd>
      </dl>
      {row.tax_tier !== 'none' && (
        <div className="text-right">
          <TaxBadge tier={row.tax_tier} stGain={row.short_term_gain} ltGain={row.long_term_gain} money={money} />
        </div>
      )}
    </div>
  );
}

export function RebalancePage({ kind = 'portfolio' }: { kind?: 'portfolio' | 'group' }) {
  const { id, groupId } = useParams<{ id: string; groupId: string }>();
  const targetId = kind === 'group' ? groupId : id;
  const navigate = useNavigate();

  const { data: tp,    isLoading: tpLoading } = useTargetPortfolio(kind === 'portfolio' ? targetId : undefined);
  const { data: group, isLoading: grLoading } = useTargetPortfolioGroup(kind === 'group' ? targetId : undefined);
  const { data: portfolios = [], isLoading: ptLoading } = usePortfolios();
  const { data: realGroups = [], isLoading: rgLoading } = useGroups();
  const target = kind === 'group' ? group : tp;

  // Comparison encoded as "p:<portfolio id>" or "g:<portfolio group id>"
  const [compareKey, setCompareKey] = useState<string>('');
  const [base, setBase] = useState<RebalanceBase>('current');
  const comparison: RebalanceComparisonRef | undefined =
    compareKey.startsWith('g:') ? { groupId: compareKey.slice(2) }
    : compareKey.startsWith('p:') ? { portfolioId: compareKey.slice(2) }
    : undefined;
  const hasInvestable = Number(target?.investable_amount) > 0;
  const effectiveBase: RebalanceBase = hasInvestable ? base : 'current';

  const { data: result, isLoading: rebalLoading, isError, error: rebalError, refetch } =
    useRebalance(kind, targetId, comparison, effectiveBase);

  const isLoading = (kind === 'group' ? grLoading : tpLoading) || ptLoading || rgLoading;

  if (isLoading) return <PageLoader />;

  const compareOptions = [
    { value: '', label: 'Select a portfolio or group…' },
    ...realGroups.map((g) => ({ value: `g:${g.id}`, label: `Group: ${g.name} (${g.base_currency})` })),
    ...portfolios.map((p) => ({ value: `p:${p.id}`, label: `${p.name} (${p.currency})` })),
  ];
  const currency = result?.comparison?.currency ?? result?.portfolio.currency ?? 'USD';
  const money: Money = (v) => formatCurrency(v, currency);
  const backPath = kind === 'group' ? `/target-portfolios/groups/${targetId}` : `/target-portfolios/${targetId}`;
  const errMsg = (rebalError as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;

  // ── Group rows by action ──────────────────────────────────
  const actionOrder: RebalanceAction[] = ['EXIT', 'SELL', 'BUY', 'HOLD'];
  const grouped = actionOrder.reduce(
    (acc, action) => {
      acc[action] = result?.rows.filter((r) => r.action === action) ?? [];
      return acc;
    },
    {} as Record<RebalanceAction, RebalanceRow[]>,
  );

  const hasSells = (grouped.SELL.length + grouped.EXIT.length) > 0;
  const showSources = kind === 'group';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(backPath)}
          className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
          aria-label={kind === 'group' ? 'Back to target group' : 'Back to target portfolio'}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--c-ink)]">Rebalance</h1>
          <p className="text-[13px] text-[var(--c-ink-mute)] truncate">
            {kind === 'group' ? 'Target group' : 'Target'}: <span className="font-medium text-[var(--c-ink)]">{target?.name}</span>
          </p>
        </div>
        {result && (
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={rebalLoading} className="shrink-0">
            <RefreshCw size={14} className={`mr-1.5 ${rebalLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      {/* Comparison + base */}
      <Card padding="sm" className="sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 sm:max-w-sm">
            <label className="block text-[12px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide mb-1.5">
              Compare against
            </label>
            <Select value={compareKey} onChange={(value) => setCompareKey(value)} options={compareOptions} />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide mb-1.5">Size targets from</p>
            <div role="radiogroup" aria-label="Size targets from" className="inline-flex p-1 rounded-full bg-[var(--c-canvas-soft)] border border-[var(--c-border)]">
              {([['current', 'Current value'], ['investable', 'Investable amount']] as const).map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={effectiveBase === value}
                  disabled={value === 'investable' && !hasInvestable}
                  onClick={() => setBase(value)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${
                    effectiveBase === value ? 'bg-[var(--c-primary)] text-white' : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!hasInvestable && (
          <p className="text-[12px] text-[var(--c-ink-mute)]">
            Save an investable amount on the {kind === 'group' ? 'group' : 'target portfolio'} to size targets from it.
          </p>
        )}
        {comparison && result && (
          <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-6 text-[13px] tnum">
            <div>
              <p className="text-[var(--c-ink-mute)] mb-0.5">Total Value</p>
              <p className="font-semibold text-[var(--c-ink)]">{money(result.total_value)}</p>
            </div>
            <div>
              <p className="text-[var(--c-ink-mute)] mb-0.5">Invested</p>
              <p className="font-semibold text-[var(--c-ink)]">{money(result.invested_value)}</p>
            </div>
            <div>
              <p className="text-[var(--c-ink-mute)] mb-0.5">Cash</p>
              <p className="font-semibold text-[var(--c-ink)]">{money(result.cash_balance)}</p>
            </div>
          </div>
        )}
        {comparison && result && (
          <p className="text-[13px] text-[var(--c-ink-sec)]">
            Targets sized from {result.base === 'investable'
              ? <>the investable amount, <span className="font-semibold text-[var(--c-ink)] tnum">{money(result.base_value)}</span>{result.investable_currency !== currency && <> ({formatCurrency(result.investable_amount ?? 0, result.investable_currency)} at {result.investable_fx_rate.toFixed(4)})</>}</>
              : <>current value, <span className="font-semibold text-[var(--c-ink)] tnum">{money(result.base_value)}</span></>}
            {result.planned_pct < 99.99 && (
              <> · plan covers {result.planned_pct}%, leaving {money(result.base_value * (1 - result.planned_pct / 100))} unallocated</>
            )}
          </p>
        )}
      </Card>

      {isError && comparison && (
        <Card padding="sm" className="sm:p-5 text-[14px] text-[var(--c-bear)]">
          {errMsg ?? 'Could not calculate the rebalance.'}
        </Card>
      )}

      {/* Loading spinner while fetching rebalance */}
      {rebalLoading && (
        <div className="flex items-center justify-center py-12 text-[var(--c-ink-mute)]">
          <RefreshCw size={20} className="animate-spin mr-2" /> Calculating…
        </div>
      )}

      {/* Rebalance table */}
      {result && !rebalLoading && (
        <>
          {/* Actions by group */}
          {actionOrder.map((action) => {
            const rows = grouped[action];
            if (rows.length === 0) return null;

            const sectionTitle: Record<RebalanceAction, string> = {
              EXIT: 'Exit — Not in target',
              SELL: 'Reduce — Over-allocated',
              BUY:  'Increase — Under-allocated',
              HOLD: 'Hold — On target',
            };

            return (
              <Card key={action} padding="none" className="overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-[var(--c-border)] bg-[var(--c-canvas-soft)]">
                  <span className="font-semibold text-[14px] text-[var(--c-ink)]">{sectionTitle[action]}</span>
                  <span className="ml-2 text-[13px] text-[var(--c-ink-mute)]">({rows.length})</span>
                </div>
                {/* Phones: one card per holding */}
                <div className="sm:hidden divide-y divide-[var(--c-border)]">
                  {rows.map((row) => <RebalanceRowCard key={row.symbol} row={row} money={money} showSources={showSources} />)}
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--c-border)]">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Symbol</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Category</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Target %</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Target $</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Current $</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Difference</th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Action</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Est. Tax Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.symbol} className="border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-canvas-soft)] transition-colors">
                          <td className={`px-4 py-3 ${showSources ? 'min-w-[15rem]' : ''}`}>
                            <span className="font-semibold text-[var(--c-primary)]">{row.symbol}</span>
                            {showSources && <Sources row={row} />}
                          </td>
                          <td className="px-4 py-3 text-[var(--c-ink-mute)]">{row.category ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {row.allocation_pct > 0 ? fmtPct(row.allocation_pct) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {row.target_value > 0 ? money(row.target_value) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {money(row.current_value)}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${diffClass(row.diff)}`}>
                            {row.diff > 0 ? '+' : ''}{money(row.diff)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ActionBadge action={row.action} />
                          </td>
                          <td className="px-4 py-3">
                            <TaxBadge
                              tier={row.tax_tier}
                              stGain={row.short_term_gain}
                              ltGain={row.long_term_gain}
                              money={money}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}

          {/* Tax summary */}
          {hasSells && (
            <Card padding="sm" className="sm:p-5 space-y-4">
              <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Tax Estimate (SMSF Accumulation Phase)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Short-term gains</p>
                  <p className="font-semibold text-[var(--c-ink)]">
                    {money(result.tax_summary.total_short_term_gain)}
                  </p>
                  <p className="text-[11px] text-[var(--c-ink-mute)] mt-0.5">
                    ~{money(result.tax_summary.estimated_tax_short_term)} tax @ 15%
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Long-term gains</p>
                  <p className="font-semibold text-[var(--c-ink)]">
                    {money(result.tax_summary.total_long_term_gain)}
                  </p>
                  <p className="text-[11px] text-[var(--c-ink-mute)] mt-0.5">
                    ~{money(result.tax_summary.estimated_tax_long_term)} tax @ 10% (1/3 discount)
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Total estimated CGT</p>
                  <p className="font-bold text-[17px] text-[var(--c-ink)]">
                    ~{money(result.tax_summary.estimated_tax_total)}
                  </p>
                </div>
              </div>

              {/* Recommended sell order */}
              <div className="p-4 rounded-xl border border-[var(--c-border)] space-y-2">
                <p className="font-semibold text-[13px] text-[var(--c-ink)]">Recommended sell order (least tax first)</p>
                {result.tax_summary.sell_order.loss_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-[var(--c-bull)] w-4">1.</span>
                    <p className="min-w-0">
                      <span className="text-[var(--c-ink-mute)]">Sell at a loss first (offsets gains):</span>{' '}
                      <span className="font-semibold text-[var(--c-ink)] break-words">{result.tax_summary.sell_order.loss_symbols.join(', ')}</span>
                    </p>
                  </div>
                )}
                {result.tax_summary.sell_order.long_term_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-[var(--c-primary)] w-4">2.</span>
                    <p className="min-w-0">
                      <span className="text-[var(--c-ink-mute)]">Long-term gains next (CGT discount, ~10% effective):</span>{' '}
                      <span className="font-semibold text-[var(--c-ink)] break-words">{result.tax_summary.sell_order.long_term_symbols.join(', ')}</span>
                    </p>
                  </div>
                )}
                {result.tax_summary.sell_order.short_term_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-[var(--c-bear)] w-4">3.</span>
                    <p className="min-w-0">
                      <span className="text-[var(--c-ink-mute)]">Short-term gains last (full 15% rate):</span>{' '}
                      <span className="font-semibold text-[var(--c-ink)] break-words">{result.tax_summary.sell_order.short_term_symbols.join(', ')}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-[12px] text-[var(--c-ink-mute)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  CGT estimates use FIFO lot matching and a flat 15% SMSF rate. Actual tax depends on
                  your fund's total income, carried losses, and contribution credits. Consult your accountant
                  before executing any trades.
                </span>
              </div>
            </Card>
          )}
        </>
      )}

      {/* No portfolio selected */}
      {!comparison && !rebalLoading && (
        <Card className="flex flex-col items-center py-14 text-center">
          <p className="text-[14px] text-[var(--c-ink-mute)]">
            Select a portfolio or group above to see how your current holdings compare to the target allocation.
          </p>
        </Card>
      )}
    </div>
  );
}
