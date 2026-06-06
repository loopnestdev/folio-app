import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Trash2, CheckCircle, BarChart2, Pencil } from 'lucide-react';
import {
  useTargetPortfolios,
  useCreateTargetPortfolio,
  useDeleteTargetPortfolio,
  useActivateTargetPortfolio,
} from '../../hooks/useTargetPortfolios';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import type { TargetPortfolio } from '../../types';

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

  if (isLoading) return <PageLoader />;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-ink)]">Target Portfolios</h1>
          <p className="text-[14px] text-[var(--c-ink-mute)] mt-1">
            Define ideal stock allocations and compare against your current holdings.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1.5" /> New Portfolio
        </Button>
      </div>

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
            <Card key={tp.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[17px] text-[var(--c-ink)] truncate">
                      {tp.name}
                    </span>
                    {tp.is_active && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--c-primary-bg)] text-[var(--c-primary)]">
                        <CheckCircle size={11} /> Active
                      </span>
                    )}
                    {!allocOk && tp.items.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                        {totalAlloc.toFixed(1)}% — needs 100%
                      </span>
                    )}
                  </div>
                  {tp.description && (
                    <p className="text-[13px] text-[var(--c-ink-mute)] mt-0.5 truncate">
                      {tp.description}
                    </p>
                  )}
                  <div className="flex gap-4 mt-2 text-[13px] text-[var(--c-ink-mute)]">
                    <span>{tp.items.length} stocks</span>
                    {tp.items.length > 0 && (
                      <span>{totalAlloc.toFixed(1)}% allocated</span>
                    )}
                    {/* Category pills */}
                    {Array.from(new Set(tp.items.map((i) => i.category).filter(Boolean))).slice(0, 4).map((cat) => (
                      <span key={cat} className="px-2 py-0.5 rounded bg-[var(--c-canvas-soft)] text-[var(--c-ink-mute)] text-[11px]">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!tp.is_active && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleActivate(tp.id)}
                      disabled={activateMutation.isPending}
                    >
                      Set Active
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/target-portfolios/${tp.id}/rebalance`)}
                    title="Rebalance analysis"
                  >
                    <BarChart2 size={14} className="mr-1" /> Rebalance
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/target-portfolios/${tp.id}`)}
                    title="Edit portfolio"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeleteTarget(tp)}
                    title="Delete portfolio"
                    className="text-[var(--c-bear)] hover:border-[var(--c-bear)]"
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
    </div>
  );
}
