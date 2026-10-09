import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, BarChart2, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  useTargetPortfolioGroup,
  useUpdateTargetPortfolioGroup,
  useSetTargetPortfolioGroupMembers,
  useActivateTargetPortfolioGroup,
} from '../../hooks/useTargetPortfolioGroups';
import { useTargetPortfolios } from '../../hooks/useTargetPortfolios';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { formatCurrency } from '../../lib/utils';
import { groupPlan } from '../../lib/targetPlan';
import type { TargetPortfolio, TargetPortfolioGroup } from '../../types';

const CURRENCIES = ['AUD', 'USD', 'HKD'];
const FIELD = 'h-10 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]';
const LABEL = 'block mb-1 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide';

interface DraftMember {
  key: string;
  target_portfolio_id: string;
  weight_pct: string;
}

let _nextKey = 0;
const newKey = () => `m${++_nextKey}`;

const pctBadgeClass = (total: number) =>
  Math.abs(total - 100) < 0.01
    ? 'bg-[var(--c-bull-bg)] text-[var(--c-bull)]'
    : Math.abs(total - 100) < 5
      ? 'bg-[var(--c-warn-bg)] text-[var(--c-warn)]'
      : 'bg-[var(--c-bear-bg)] text-[var(--c-bear)]';

export function TargetGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { data: group, isLoading } = useTargetPortfolioGroup(groupId);
  const { data: portfolios = [], isLoading: tpLoading } = useTargetPortfolios();

  if (isLoading || tpLoading || !group) return <PageLoader />;
  // Remount the editor whenever the saved group changes, so its draft state starts from the latest data
  return <GroupEditor key={`${group.id}:${group.updated_at}:${group.members.length}`} group={group} portfolios={portfolios} />;
}

function GroupEditor({ group, portfolios }: { group: TargetPortfolioGroup; portfolios: TargetPortfolio[] }) {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const updateMutation   = useUpdateTargetPortfolioGroup(group.id);
  const membersMutation  = useSetTargetPortfolioGroupMembers(group.id);
  const activateMutation = useActivateTargetPortfolioGroup();

  const [name, setName]             = useState(group.name);
  const [desc, setDesc]             = useState(group.description ?? '');
  const [investable, setInvestable] = useState(group.investable_amount != null ? String(group.investable_amount) : '');
  const [currency, setCurrency]     = useState(group.investable_currency || 'AUD');
  const [members, setMembers]       = useState<DraftMember[]>(
    group.members.map((m) => ({ key: newKey(), target_portfolio_id: m.target_portfolio_id, weight_pct: String(m.weight_pct) })),
  );
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  const investableNum = Math.max(parseFloat(investable) || 0, 0);
  const validMembers  = members.filter((m) => m.target_portfolio_id && parseFloat(m.weight_pct) > 0);
  const totalWeight   = members.reduce((s, m) => s + (parseFloat(m.weight_pct) || 0), 0);
  const plan = groupPlan(
    validMembers.map((m) => ({ target_portfolio_id: m.target_portfolio_id, weight_pct: parseFloat(m.weight_pct) })),
    portfolios,
    investableNum,
  );
  const plannedPct = plan.reduce((s, l) => s + l.pct, 0);
  const money = (v: number) => formatCurrency(v, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const usedIds = new Set(members.map((m) => m.target_portfolio_id));
  const canAdd  = portfolios.some((p) => !usedIds.has(p.id));

  const addMember = () => {
    const next = portfolios.find((p) => !usedIds.has(p.id));
    setMembers((prev) => [...prev, { key: newKey(), target_portfolio_id: next?.id ?? '', weight_pct: '' }]);
    setDirty(true);
  };
  const updateMember = (key: string, field: 'target_portfolio_id' | 'weight_pct', value: string) => {
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, [field]: value } : m)));
    setDirty(true);
  };
  const removeMember = (key: string) => {
    setMembers((prev) => prev.filter((m) => m.key !== key));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { error('Name is required'); return; }
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        description: desc.trim() || null,
        investable_amount: investable.trim() === '' ? null : investableNum,
        investable_currency: currency,
      });
      await membersMutation.mutateAsync(validMembers.map((m, idx) => ({
        target_portfolio_id: m.target_portfolio_id,
        weight_pct: parseFloat(m.weight_pct),
        sort_order: idx,
      })));
      setDirty(false);
      success('Group saved');
    } catch {
      error('Failed to save group');
    }
  };

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync(group.id);
      success('Set as active plan');
    } catch {
      error('Failed to activate');
    }
  };

  const saving = updateMutation.isPending || membersMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => navigate('/target-portfolios')}
            className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
            aria-label="Back to target portfolios"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--c-ink)] truncate">{group.name}</h1>
            <p className="text-[13px] text-[var(--c-ink-mute)]">Target Group</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {group.is_active ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[var(--c-primary-bg)] text-[var(--c-primary)]">
              <CheckCircle size={12} /> Active
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleActivate} disabled={activateMutation.isPending}>
              Set Active
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => navigate(`/target-portfolios/groups/${group.id}/rebalance`)}>
            <BarChart2 size={14} className="mr-1.5" /> Rebalance
          </Button>
        </div>
      </div>

      {/* Details */}
      <Card padding="sm" className="sm:p-5 space-y-4">
        <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Group name" value={name} onChange={(e) => touch(setName)(e.target.value)} />
          <Input label="Description (optional)" value={desc} onChange={(e) => touch(setDesc)(e.target.value)} />
        </div>
        <div>
          <label htmlFor="group-investable" className="text-[15px] font-medium text-[var(--c-ink)]">Investable amount</label>
          <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5 mb-2">
            The capital this plan is sized for, from the start of investing. Each stock's planned amount below is this × portfolio % × stock %.
          </p>
          <div className="flex gap-2">
            <select
              aria-label="Investable currency"
              value={currency}
              onChange={(e) => touch(setCurrency)(e.target.value)}
              className={`${FIELD} w-24`}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              id="group-investable"
              type="number"
              min="0"
              step="1000"
              placeholder="e.g. 300000"
              value={investable}
              onChange={(e) => touch(setInvestable)(e.target.value)}
              className={`${FIELD} flex-1 min-w-0 text-right tnum`}
            />
          </div>
        </div>
      </Card>

      {/* Members */}
      <Card padding="sm" className="sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Portfolios</h2>
          <div className="flex items-center gap-3">
            <span className={`text-[13px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap tnum ${pctBadgeClass(totalWeight)}`}>
              {totalWeight.toFixed(1)}% / 100%
            </span>
            <Button variant="secondary" size="sm" onClick={addMember} disabled={!canAdd} className="whitespace-nowrap">
              <Plus size={14} className="mr-1" /> Add Portfolio
            </Button>
          </div>
        </div>

        {members.length > 0 && Math.abs(totalWeight - 100) >= 0.01 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-[var(--c-warn-border)] bg-[var(--c-warn-bg)] text-[var(--c-ink)] text-[13px]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--c-warn)]" />
            <span>Portfolio weights should total 100%. Currently {totalWeight.toFixed(1)}%; the rest stays unallocated.</span>
          </div>
        )}

        {members.length === 0 && (
          <p className="text-center py-6 text-[14px] text-[var(--c-ink-mute)]">
            {portfolios.length ? 'No portfolios in this group yet. Click "Add Portfolio".' : 'Create a target portfolio first, then add it here.'}
          </p>
        )}

        <div className="space-y-3">
          {members.map((m) => {
            const tp = portfolios.find((p) => p.id === m.target_portfolio_id);
            const itemsPct = tp?.items.reduce((s, i) => s + Number(i.allocation_pct), 0) ?? 0;
            const w = parseFloat(m.weight_pct) || 0;
            return (
              <div key={m.key} className="grid grid-cols-[1fr_6.5rem_2rem] sm:grid-cols-[1fr_7rem_8rem_2rem] gap-2 items-end p-3 rounded-xl border border-[var(--c-border)]">
                <label className="min-w-0">
                  <span className={LABEL}>Target portfolio</span>
                  <select
                    value={m.target_portfolio_id}
                    onChange={(e) => updateMember(m.key, 'target_portfolio_id', e.target.value)}
                    className={`${FIELD} w-full`}
                  >
                    {!tp && <option value="">Select…</option>}
                    {portfolios
                      .filter((p) => p.id === m.target_portfolio_id || !usedIds.has(p.id))
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className={LABEL}>Weight %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="40"
                    value={m.weight_pct}
                    onChange={(e) => updateMember(m.key, 'weight_pct', e.target.value)}
                    className={`${FIELD} w-full text-right tnum`}
                  />
                </label>
                <div className="hidden sm:block">
                  <span className={LABEL}>Planned</span>
                  <p className="h-10 flex items-center justify-end text-[14px] text-[var(--c-ink-sec)] tnum">{money((w / 100) * investableNum)}</p>
                </div>
                <button
                  onClick={() => removeMember(m.key)}
                  aria-label={`Remove ${tp?.name ?? 'portfolio'}`}
                  className="h-10 flex items-center justify-center text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] transition-colors"
                >
                  <Trash2 size={15} />
                </button>
                <p className="col-span-full flex flex-wrap gap-x-3 text-[12px] text-[var(--c-ink-mute)] tnum">
                  <span className="sm:hidden">Planned {money((w / 100) * investableNum)}</span>
                  {tp && <span>{tp.items.length} stocks</span>}
                  {tp && Math.abs(itemsPct - 100) >= 0.01 && (
                    <span className="text-[var(--c-warn)]">stocks allocated {itemsPct.toFixed(1)}%</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!dirty || saving} className="w-full sm:w-auto">
            <Save size={15} className="mr-1.5" />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>

      {/* Per-stock plan */}
      {plan.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--c-border)] bg-[var(--c-canvas-soft)] flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-[14px] text-[var(--c-ink)]">Planned allocation per stock</span>
            <span className="text-[12px] text-[var(--c-ink-mute)] tnum">
              {plannedPct.toFixed(1)}% of {investableNum > 0 ? money(investableNum) : 'the investable amount'}
            </span>
          </div>
          <ul className="divide-y divide-[var(--c-border)]">
            {plan.map((l) => (
              <li key={l.symbol} className="px-4 sm:px-5 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px]">
                    <span className="font-semibold text-[var(--c-primary)]">{l.symbol}</span>
                    {l.category && <span className="ml-2 text-[12px] text-[var(--c-ink-mute)]">{l.category}</span>}
                  </p>
                  <p className="text-[12px] text-[var(--c-ink-mute)] break-words">
                    {l.sources.map((s) => `${s.name} ${s.weight_pct}% × ${s.item_pct}%`).join(' + ')}
                  </p>
                </div>
                <div className="text-right shrink-0 tnum">
                  <p className="text-[14px] font-medium text-[var(--c-ink)]">{investableNum > 0 ? money(l.amount) : '—'}</p>
                  <p className="text-[12px] text-[var(--c-ink-mute)]">{l.pct.toFixed(2)}%</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
