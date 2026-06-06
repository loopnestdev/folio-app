import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, LogOut, AlertTriangle } from 'lucide-react';
import { useRebalance, useTargetPortfolio } from '../../hooks/useTargetPortfolios';
import { usePortfolios } from '../../hooks/usePortfolio';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';
import type { RebalanceAction, TaxTier, RebalanceRow } from '../../types';

// ── Action badge ──────────────────────────────────────────────
function ActionBadge({ action }: { action: RebalanceAction }) {
  const cfg: Record<RebalanceAction, { label: string; icon: React.ReactNode; className: string }> = {
    BUY:  { label: 'BUY',  icon: <TrendingUp  size={11} />, className: 'bg-emerald-100 text-emerald-700' },
    SELL: { label: 'SELL', icon: <TrendingDown size={11} />, className: 'bg-red-100 text-red-700' },
    HOLD: { label: 'HOLD', icon: <Minus        size={11} />, className: 'bg-gray-100 text-gray-600' },
    EXIT: { label: 'EXIT', icon: <LogOut       size={11} />, className: 'bg-amber-100 text-amber-700' },
  };
  const { label, icon, className } = cfg[action];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${className}`}>
      {icon} {label}
    </span>
  );
}

// ── Tax tier badge ────────────────────────────────────────────
function TaxBadge({ tier, stGain, ltGain }: { tier: TaxTier; stGain: number; ltGain: number }) {
  if (tier === 'none') return null;
  const totalGain = stGain + ltGain;
  if (tier === 'loss') {
    return <span className="text-[12px] text-emerald-600 font-medium">Loss ({formatCurrency(totalGain)})</span>;
  }
  if (tier === 'long_term') {
    return (
      <span className="text-[12px] text-blue-600 font-medium" title="CGT discount eligible (≥365 days)">
        LT gain {formatCurrency(totalGain)}
      </span>
    );
  }
  return (
    <span className="text-[12px] text-red-600 font-medium" title="Short-term — no CGT discount">
      ST gain {formatCurrency(totalGain)}
    </span>
  );
}

export function RebalancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: tp, isLoading: tpLoading } = useTargetPortfolio(id);
  const { data: portfolios = [],  isLoading: ptLoading } = usePortfolios();
  const [portfolioId, setPortfolioId] = useState<string>('');

  const { data: result, isLoading: rebalLoading, refetch } = useRebalance(id, portfolioId || undefined);

  const isLoading = tpLoading || ptLoading;

  if (isLoading) return <PageLoader />;

  const portfolioOptions = portfolios.map((p) => ({ value: p.id, label: `${p.name} (${p.currency})` }));

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/target-portfolios/${id}`)}
          className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[var(--c-ink)]">Rebalance</h1>
          <p className="text-[13px] text-[var(--c-ink-mute)]">
            Target: <span className="font-medium text-[var(--c-ink)]">{tp?.name}</span>
          </p>
        </div>
        {result && (
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={rebalLoading}>
            <RefreshCw size={14} className={`mr-1.5 ${rebalLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      {/* Portfolio selector */}
      <Card className="p-5">
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-sm">
            <label className="block text-[12px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide mb-1.5">
              Compare against portfolio
            </label>
            <Select
              value={portfolioId}
              onChange={(value) => setPortfolioId(value)}
              options={[{ value: '', label: 'Select a portfolio…' }, ...portfolioOptions]}
            />
          </div>
          {portfolioId && result && (
            <div className="flex gap-6 text-[13px] pb-0.5">
              <div>
                <p className="text-[var(--c-ink-mute)] mb-0.5">Total Value</p>
                <p className="font-semibold text-[var(--c-ink)]">
                  {result.portfolio.currency} {formatCurrency(result.total_value)}
                </p>
              </div>
              <div>
                <p className="text-[var(--c-ink-mute)] mb-0.5">Invested</p>
                <p className="font-semibold text-[var(--c-ink)]">
                  {formatCurrency(result.invested_value)}
                </p>
              </div>
              <div>
                <p className="text-[var(--c-ink-mute)] mb-0.5">Cash</p>
                <p className="font-semibold text-[var(--c-ink)]">
                  {formatCurrency(result.cash_balance)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

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
              <Card key={action} className="overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--c-border)] bg-[var(--c-canvas-soft)]">
                  <span className="font-semibold text-[14px] text-[var(--c-ink)]">{sectionTitle[action]}</span>
                  <span className="ml-2 text-[13px] text-[var(--c-ink-mute)]">({rows.length})</span>
                </div>
                <div className="overflow-x-auto">
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
                          <td className="px-4 py-3 font-semibold text-[var(--c-primary)]">{row.symbol}</td>
                          <td className="px-4 py-3 text-[var(--c-ink-mute)]">{row.category ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {row.allocation_pct > 0 ? `${row.allocation_pct}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {row.target_value > 0 ? formatCurrency(row.target_value) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--c-ink)]">
                            {formatCurrency(row.current_value)}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            row.diff > 0
                              ? 'text-emerald-600'
                              : row.diff < 0
                              ? 'text-red-600'
                              : 'text-[var(--c-ink-mute)]'
                          }`}>
                            {row.diff > 0 ? '+' : ''}{formatCurrency(row.diff)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ActionBadge action={row.action} />
                          </td>
                          <td className="px-4 py-3">
                            <TaxBadge
                              tier={row.tax_tier}
                              stGain={row.short_term_gain}
                              ltGain={row.long_term_gain}
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
            <Card className="p-5 space-y-4">
              <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Tax Estimate (SMSF Accumulation Phase)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Short-term gains</p>
                  <p className="font-semibold text-[var(--c-ink)]">
                    {formatCurrency(result.tax_summary.total_short_term_gain)}
                  </p>
                  <p className="text-[11px] text-[var(--c-ink-mute)] mt-0.5">
                    ~{formatCurrency(result.tax_summary.estimated_tax_short_term)} tax @ 15%
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Long-term gains</p>
                  <p className="font-semibold text-[var(--c-ink)]">
                    {formatCurrency(result.tax_summary.total_long_term_gain)}
                  </p>
                  <p className="text-[11px] text-[var(--c-ink-mute)] mt-0.5">
                    ~{formatCurrency(result.tax_summary.estimated_tax_long_term)} tax @ 10% (1/3 discount)
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--c-canvas-soft)]">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">Total estimated CGT</p>
                  <p className="font-bold text-[17px] text-[var(--c-ink)]">
                    ~{formatCurrency(result.tax_summary.estimated_tax_total)}
                  </p>
                </div>
              </div>

              {/* Recommended sell order */}
              <div className="p-4 rounded-xl border border-[var(--c-border)] space-y-2">
                <p className="font-semibold text-[13px] text-[var(--c-ink)]">Recommended sell order (least tax first)</p>
                {result.tax_summary.sell_order.loss_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-emerald-600 w-4">1.</span>
                    <span className="text-[var(--c-ink-mute)]">Sell at a loss first (offsets gains):</span>
                    <span className="font-semibold text-[var(--c-ink)]">{result.tax_summary.sell_order.loss_symbols.join(', ')}</span>
                  </div>
                )}
                {result.tax_summary.sell_order.long_term_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-blue-600 w-4">2.</span>
                    <span className="text-[var(--c-ink-mute)]">Long-term gains next (CGT discount, ~10% effective):</span>
                    <span className="font-semibold text-[var(--c-ink)]">{result.tax_summary.sell_order.long_term_symbols.join(', ')}</span>
                  </div>
                )}
                {result.tax_summary.sell_order.short_term_symbols.length > 0 && (
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-red-600 w-4">3.</span>
                    <span className="text-[var(--c-ink-mute)]">Short-term gains last (full 15% rate):</span>
                    <span className="font-semibold text-[var(--c-ink)]">{result.tax_summary.sell_order.short_term_symbols.join(', ')}</span>
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
      {!portfolioId && !rebalLoading && (
        <Card className="flex flex-col items-center py-14 text-center">
          <p className="text-[14px] text-[var(--c-ink-mute)]">
            Select a portfolio above to see how your current holdings compare to the target allocation.
          </p>
        </Card>
      )}
    </div>
  );
}
