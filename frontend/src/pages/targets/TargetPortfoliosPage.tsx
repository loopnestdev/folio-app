import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Trash2, CheckCircle, BarChart2, Pencil, Layers } from 'lucide-react';
import {
  useTargetPortfolios,
  useCreateTargetPortfolio,
  useDeleteTargetPortfolio,
  useActivateTargetPortfolio,
} from '../../hooks/useTargetPortfolios';
import {
  useTargetPortfolioGroups,
  useCreateTargetPortfolioGroup,
  useDeleteTargetPortfolioGroup,
  useActivateTargetPortfolioGroup,
} from '../../hooks/useTargetPortfolioGroups';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { formatCurrency } from '../../lib/utils';
import type { TargetPortfolio, TargetPortfolioGroup } from '../../types';

// Card action buttons: text buttons share the row on phones, icon buttons stay 38px square
const TEXT_BTN = 'flex-1 min-w-0 px-3! sm:flex-none sm:px-4! whitespace-nowrap';
const ICON_BTN = 'w-[38px] px-0! shrink-0 justify-center';

export function TargetPortfoliosPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { data: portfolios = [], isLoading } = useTargetPortfolios();
  const createMutation   = useCreateTargetPortfolio();
  const deleteMutation   = useDeleteTargetPortfolio();
  const activateMutation = useActivateTargetPortfolio();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TargetPortfolio | null>(null);

  const { data: groups = [], isLoading: groupsLoading } = useTargetPortfolioGroups();
  const createGroupMutation   = useCreateTargetPortfolioGroup();
  const deleteGroupMutation   = useDeleteTargetPortfolioGroup();
  const activateGroupMutation = useActivateTargetPortfolioGroup();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName]       = useState('');
  const [newGroupDesc, setNewGroupDesc]       = useState('');
  const [deleteGroup, setDeleteGroup]         = useState<TargetPortfolioGroup | null>(null);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const created = await createGroupMutation.mutateAsync({ name: newGroupName.trim(), description: newGroupDesc.trim() || null });
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDesc('');
      navigate(`/target-portfolios/groups/${created.id}`);
    } catch {
      error('Failed to create group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroup) return;
    try {
      await deleteGroupMutation.mutateAsync(deleteGroup.id);
      setDeleteGroup(null);
      success('Group deleted');
    } catch {
      error('Failed to delete group');
    }
  };

  const handleActivateGroup = async (id: string) => {
    try {
      await activateGroupMutation.mutateAsync(id);
      success('Active plan updated');
    } catch {
      error('Failed to activate group');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMutation.mutateAsync({ name: newName.trim(), description: newDesc.trim() || null });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate(`/target-portfolios/${created.id}`);
    } catch {
      error('Failed to create portfolio');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      success('Portfolio deleted');
    } catch {
      error('Failed to delete portfolio');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activateMutation.mutateAsync(id);
      success('Active portfolio updated');
    } catch {
      error('Failed to activate portfolio');
    }
  };

  if (isLoading || groupsLoading) return <PageLoader />;
  const portfolioName = (id: string) => portfolios.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header — stacks on phones so the button keeps its one-line label */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Target Portfolios</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            Define ideal stock allocations and compare against your current holdings.
          </p>
        </div>
        <div className="flex gap-2 self-start shrink-0">
          <Button variant="secondary" onClick={() => setShowCreateGroup(true)} className="whitespace-nowrap">
            <Layers size={16} className="mr-1.5" /> New Group
          </Button>
          <Button onClick={() => setShowCreate(true)} className="whitespace-nowrap">
            <Plus size={16} className="mr-1.5" /> New Portfolio
          </Button>
        </div>
      </div>

      {/* Groups — several target portfolios, each weighted as a % of the group */}
      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--c-ink-mute)]">Groups</h2>
          <div className="grid gap-4">
            {groups.map((g) => {
              const totalWeight = g.members.reduce((s, m) => s + Number(m.weight_pct), 0);
              const weightOk    = Math.abs(totalWeight - 100) < 0.01;
              return (
                <Card key={g.id} padding="sm" className="sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Layers size={16} className="text-[var(--c-primary)] shrink-0" />
                        <span className="font-semibold text-[17px] text-[var(--c-ink)] break-words min-w-0">{g.name}</span>
                        {g.is_active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--c-primary-bg)] text-[var(--c-primary)]">
                            <CheckCircle size={11} /> Active
                          </span>
                        )}
                        {!weightOk && g.members.length > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--c-warn-bg)] text-[var(--c-warn)]">
                            {totalWeight.toFixed(1)}% — needs 100%
                          </span>
                        )}
                      </div>
                      {g.description && (
                        <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5 truncate">{g.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[13px] text-[var(--c-ink-mute)]">
                        <span className="whitespace-nowrap tnum">{g.members.length} portfolio{g.members.length === 1 ? '' : 's'}</span>
                        {g.investable_amount != null && (
                          <span className="whitespace-nowrap tnum">
                            {formatCurrency(Number(g.investable_amount), g.investable_currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} investable
                          </span>
                        )}
                      </div>
                      {g.members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {g.members.map((m) => (
                            <span key={m.id} className="px-2 py-0.5 rounded bg-[var(--c-canvas-soft)] text-[var(--c-ink-sec)] text-[11px] whitespace-nowrap tnum">
                              {portfolioName(m.target_portfolio_id)} · {Number(m.weight_pct)}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-stretch gap-2 sm:shrink-0">
                      {!g.is_active && (
                        <Button variant="secondary" size="sm" onClick={() => handleActivateGroup(g.id)} disabled={activateGroupMutation.isPending} className={TEXT_BTN}>
                          Set Active
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/target-portfolios/groups/${g.id}/rebalance`)} title="Rebalance analysis" className={TEXT_BTN}>
                        <BarChart2 size={14} className="mr-1 hidden sm:inline" /> Rebalance
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/target-portfolios/groups/${g.id}`)} title="Edit group" aria-label="Edit group" className={ICON_BTN}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDeleteGroup(g)} title="Delete group" aria-label="Delete group" className={`${ICON_BTN} text-[var(--c-bear)] hover:border-[var(--c-bear)]`}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {portfolios.length > 0 && groups.length > 0 && (
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--c-ink-mute)]">Portfolios</h2>
      )}

      {/* Empty state */}
      {portfolios.length === 0 && (
        <Card className="flex flex-col items-center py-16 text-center">
          <Target size={40} className="text-[var(--c-ink-mute)] mb-4" />
          <p className="font-semibold text-[var(--c-ink)] mb-1">No target portfolios yet</p>
          <p className="text-[14px] text-[var(--c-ink-mute)] mb-6">
            Create one to define your ideal stock allocation and get rebalancing advice.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1.5" /> Create First Portfolio
          </Button>
        </Card>
      )}

      {/* Portfolio cards */}
      <div className="grid gap-4">
        {portfolios.map((tp) => {
          const totalAlloc = tp.items.reduce((s, i) => s + i.allocation_pct, 0);
          const allocOk    = Math.abs(totalAlloc - 100) < 0.01;

          return (
            <Card key={tp.id} padding="sm" className="sm:p-5">
              {/* Actions sit under the info on phones, beside it from sm up */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[17px] text-[var(--c-ink)] break-words min-w-0">
                      {tp.name}
                    </span>
                    {tp.is_active && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--c-primary-bg)] text-[var(--c-primary)]">
                        <CheckCircle size={11} /> Active
                      </span>
                    )}
                    {!allocOk && tp.items.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[var(--c-warn-bg)] text-[var(--c-warn)]">
                        {totalAlloc.toFixed(1)}% — needs 100%
                      </span>
                    )}
                  </div>
                  {tp.description && (
                    <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5 truncate">
                      {tp.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[13px] text-[var(--c-ink-mute)]">
                    <span className="whitespace-nowrap tnum">{tp.items.length} stocks</span>
                    {tp.items.length > 0 && (
                      <span className="whitespace-nowrap tnum">{totalAlloc.toFixed(1)}% allocated</span>
                    )}
                  </div>
                  {/* Category pills — wrap instead of running off the card */}
                  {tp.items.some((i) => i.category) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from(new Set(tp.items.map((i) => i.category).filter(Boolean))).slice(0, 4).map((cat) => (
                        <span key={cat} className="px-2 py-0.5 rounded bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)] text-[11px] whitespace-nowrap">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: actions — text buttons share the row on phones, icon buttons stay square */}
                <div className="flex items-stretch gap-2 sm:shrink-0">
                  {!tp.is_active && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleActivate(tp.id)}
                      disabled={activateMutation.isPending}
                      className={TEXT_BTN}
                    >
                      Set Active
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/target-portfolios/${tp.id}/rebalance`)}
                    title="Rebalance analysis"
                    className={TEXT_BTN}
                  >
                    <BarChart2 size={14} className="mr-1 hidden sm:inline" /> Rebalance
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/target-portfolios/${tp.id}`)}
                    title="Edit portfolio"
                    aria-label="Edit portfolio"
                    className={ICON_BTN}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeleteTarget(tp)}
                    title="Delete portfolio"
                    aria-label="Delete portfolio"
                    className={`${ICON_BTN} text-[var(--c-bear)] hover:border-[var(--c-bear)]`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Target Portfolio">
        <div className="space-y-4">
          <Input
            label="Portfolio name"
            placeholder="e.g. AI Infrastructure"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <Input
            label="Description (optional)"
            placeholder="e.g. High-growth AI and infrastructure plays"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
              Create &amp; Edit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Portfolio">
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--c-ink)]">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-[var(--c-bear)] hover:bg-[var(--c-bear)]/90 text-white border-transparent"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
      {/* Create group modal */}
      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="New Target Group">
        <div className="space-y-4">
          <Input
            label="Group name"
            placeholder="e.g. Super - long term"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
            autoFocus
          />
          <Input
            label="Description (optional)"
            placeholder="e.g. 40% ETFs, 60% growth"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || createGroupMutation.isPending}>
              Create &amp; Edit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete group confirm modal */}
      <Modal open={!!deleteGroup} onClose={() => setDeleteGroup(null)} title="Delete Group">
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--c-ink)]">
            Delete the group <strong>{deleteGroup?.name}</strong>? Its target portfolios are kept. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteGroup(null)}>Cancel</Button>
            <Button
              onClick={handleDeleteGroup}
              disabled={deleteGroupMutation.isPending}
              className="bg-[var(--c-bear)] hover:bg-[var(--c-bear)]/90 text-white border-transparent"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
