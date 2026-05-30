import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, ArrowRight, Briefcase, Layers, BarChart3,
} from 'lucide-react';
import {
  usePortfolios, useCreatePortfolio, useUpdatePortfolio, useDeletePortfolio,
} from '../hooks/usePortfolio';
import {
  useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup,
} from '../hooks/useGroups';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal, ModalActions } from '../components/ui/Modal';
import { PortfolioForm, type PortfolioFormValues } from '../components/forms/PortfolioForm';
import { GroupForm, type GroupFormValues } from '../components/forms/GroupForm';
import { useToast } from '../components/ui/Toast';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { formatDate } from '../lib/utils';
import type { Portfolio, PortfolioGroup } from '../types';

export function PortfoliosPage() {
  const { data: portfolios = [], isLoading: portLoading } = usePortfolios();
  const { data: groups   = [], isLoading: grpLoading  } = useGroups();
  const { activePortfolio, setActivePortfolio } = usePortfolioContext();
  const toast    = useToast();
  const navigate = useNavigate();

  // ── Portfolio modal state ──────────────────────────────────
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  const [editPortfolio, setEditPortfolio]   = useState<Portfolio | null>(null);
  const [deletePortfolio, setDeletePortfolio] = useState<Portfolio | null>(null);

  // ── Group modal state ──────────────────────────────────────
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [editGroup, setEditGroup]   = useState<PortfolioGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<PortfolioGroup | null>(null);

  // ── Mutations ──────────────────────────────────────────────
  const createPortfolio = useCreatePortfolio();
  const deletePortfolioMut = useDeletePortfolio();
  const updatePortfolioMut = useUpdatePortfolio(editPortfolio?.id ?? '');

  const createGroupMut = useCreateGroup();
  const deleteGroupMut = useDeleteGroup();
  const updateGroupMut = useUpdateGroup(editGroup?.id ?? '');

  // ── Portfolio handlers ─────────────────────────────────────
  const handleCreatePortfolio = async (values: PortfolioFormValues) => {
    try {
      await createPortfolio.mutateAsync({
        ...values,
        description: values.description ?? null,
        group_id: values.group_id ?? null,
      });
      toast.success('Portfolio created', `"${values.name}" is ready.`);
      setCreatePortfolioOpen(false);
    } catch {
      toast.error('Failed to create portfolio');
    }
  };

  const handleEditPortfolio = async (values: PortfolioFormValues) => {
    if (!editPortfolio) return;
    try {
      await updatePortfolioMut.mutateAsync({
        ...values,
        description: values.description ?? null,
        group_id: values.group_id ?? null,
      });
      toast.success('Portfolio updated');
      setEditPortfolio(null);
    } catch {
      toast.error('Failed to update portfolio');
    }
  };

  const handleDeletePortfolio = async () => {
    if (!deletePortfolio) return;
    try {
      await deletePortfolioMut.mutateAsync(deletePortfolio.id);
      toast.success('Portfolio deleted');
      setDeletePortfolio(null);
    } catch {
      toast.error('Failed to delete portfolio');
    }
  };

  // ── Group handlers ─────────────────────────────────────────
  const handleCreateGroup = async (values: GroupFormValues) => {
    try {
      await createGroupMut.mutateAsync({ ...values, description: values.description ?? null });
      toast.success('Group created', `"${values.name}" is ready.`);
      setCreateGroupOpen(false);
    } catch {
      toast.error('Failed to create group');
    }
  };

  const handleEditGroup = async (values: GroupFormValues) => {
    if (!editGroup) return;
    try {
      await updateGroupMut.mutateAsync({ ...values, description: values.description ?? null });
      toast.success('Group updated');
      setEditGroup(null);
    } catch {
      toast.error('Failed to update group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroup) return;
    try {
      await deleteGroupMut.mutateAsync(deleteGroup.id);
      toast.success('Group deleted', 'Portfolios have been ungrouped.');
      setDeleteGroup(null);
    } catch {
      toast.error('Failed to delete group');
    }
  };

  if (portLoading || grpLoading) return <PageLoader />;

  // ── Derived data ───────────────────────────────────────────
  const ungrouped = portfolios.filter((p) => !p.group_id);
  const hasGroups = groups.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Portfolios</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Manage your investment portfolios</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            icon={<Layers size={16} />}
            onClick={() => setCreateGroupOpen(true)}
          >
            New Group
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={() => setCreatePortfolioOpen(true)}
          >
            New Portfolio
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {portfolios.length === 0 && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-[var(--c-primary-bg)] rounded-full flex items-center justify-center">
            <Briefcase size={28} className="text-[var(--c-primary)]" />
          </div>
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-[var(--c-ink)] mb-2">No portfolios yet</h2>
            <p className="text-[15px] text-[var(--c-ink-mute)]">
              Create your first portfolio to get started. Use groups to bundle related accounts (e.g. Moomoo AUD + US).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" icon={<Layers size={16} />} onClick={() => setCreateGroupOpen(true)}>
              New Group
            </Button>
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreatePortfolioOpen(true)}>
              Create Portfolio
            </Button>
          </div>
        </div>
      )}

      {/* ── Grouped layout ──────────────────────────────────── */}
      {(portfolios.length > 0 || groups.length > 0) && (
        <div className="space-y-8">
          {hasGroups && groups.map((group) => {
            const gPortfolios = portfolios.filter((p) => p.group_id === group.id);
            return (
              <section key={group.id}>
                {/* Group header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[var(--c-primary)]" />
                    <h2 className="text-[17px] font-semibold text-[var(--c-ink)]">{group.name}</h2>
                    <span className="text-[13px] text-[var(--c-ink-mute)]">
                      {gPortfolios.length} portfolio{gPortfolios.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/groups/${group.id}`}
                      className="flex items-center gap-1 text-[13px] text-[var(--c-primary)] font-medium hover:underline"
                    >
                      <BarChart3 size={13} /> Dashboard
                    </Link>
                    <button
                      onClick={() => setEditGroup(group)}
                      className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] rounded-lg hover:bg-[var(--c-canvas-soft)] transition-colors"
                      aria-label="Edit group"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteGroup(group)}
                      className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] rounded-lg hover:bg-[var(--c-bear-bg)] transition-colors"
                      aria-label="Delete group"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Portfolio cards inside the group */}
                {gPortfolios.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-border)] rounded-2xl p-8 text-center text-[14px] text-[var(--c-ink-mute)]">
                    No portfolios in this group yet. Edit a portfolio to assign it here.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {gPortfolios.map((portfolio) => (
                      <PortfolioCard
                        key={portfolio.id}
                        portfolio={portfolio}
                        isActive={activePortfolio?.id === portfolio.id}
                        onActivate={() => { setActivePortfolio(portfolio); navigate('/'); }}
                        onOpen={() => { setActivePortfolio(portfolio); navigate(`/portfolios/${portfolio.id}/holdings`); }}
                        onEdit={() => setEditPortfolio(portfolio)}
                        onDelete={() => setDeletePortfolio(portfolio)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {/* ── Ungrouped section ──────────────────────────── */}
          {ungrouped.length > 0 && (
            <section>
              {hasGroups && (
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[17px] font-semibold text-[var(--c-ink-mute)]">Ungrouped</h2>
                  <span className="text-[13px] text-[var(--c-ink-mute)]">
                    {ungrouped.length} portfolio{ungrouped.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ungrouped.map((portfolio) => (
                  <PortfolioCard
                    key={portfolio.id}
                    portfolio={portfolio}
                    isActive={activePortfolio?.id === portfolio.id}
                    onActivate={() => { setActivePortfolio(portfolio); navigate('/'); }}
                    onOpen={() => { setActivePortfolio(portfolio); navigate(`/portfolios/${portfolio.id}/holdings`); }}
                    onEdit={() => setEditPortfolio(portfolio)}
                    onDelete={() => setDeletePortfolio(portfolio)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Modals — portfolios ─────────────────────────────── */}
      <PortfolioForm
        open={createPortfolioOpen}
        onClose={() => setCreatePortfolioOpen(false)}
        onSubmit={handleCreatePortfolio}
        mode="create"
        groups={groups}
      />

      {editPortfolio && (
        <PortfolioForm
          open={!!editPortfolio}
          onClose={() => setEditPortfolio(null)}
          onSubmit={handleEditPortfolio}
          defaultValues={editPortfolio}
          mode="edit"
          groups={groups}
        />
      )}

      <Modal
        open={!!deletePortfolio}
        onClose={() => setDeletePortfolio(null)}
        title="Delete Portfolio"
        size="sm"
      >
        <p className="text-[15px] text-[var(--c-ink)]">
          Are you sure you want to delete{' '}
          <strong>"{deletePortfolio?.name}"</strong>? This will permanently delete all trades and
          data associated with this portfolio.
        </p>
        <ModalActions>
          <Button variant="ghost" onClick={() => setDeletePortfolio(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDeletePortfolio}
            loading={deletePortfolioMut.isPending}
          >
            Delete Portfolio
          </Button>
        </ModalActions>
      </Modal>

      {/* ── Modals — groups ─────────────────────────────────── */}
      <GroupForm
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onSubmit={handleCreateGroup}
        mode="create"
      />

      {editGroup && (
        <GroupForm
          open={!!editGroup}
          onClose={() => setEditGroup(null)}
          onSubmit={handleEditGroup}
          defaultValues={editGroup}
          mode="edit"
        />
      )}

      <Modal
        open={!!deleteGroup}
        onClose={() => setDeleteGroup(null)}
        title="Delete Group"
        size="sm"
      >
        <p className="text-[15px] text-[var(--c-ink)]">
          Are you sure you want to delete the group{' '}
          <strong>"{deleteGroup?.name}"</strong>? The portfolios inside it will be ungrouped —
          no trade data will be lost.
        </p>
        <ModalActions>
          <Button variant="ghost" onClick={() => setDeleteGroup(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDeleteGroup}
            loading={deleteGroupMut.isPending}
          >
            Delete Group
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
}

// ── Portfolio Card ───────────────────────────────────────────
function PortfolioCard({
  portfolio,
  isActive,
  onActivate,
  onOpen,
  onEdit,
  onDelete,
}: {
  portfolio: Portfolio;
  isActive: boolean;
  onActivate: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className={`transition-all hover:border-[var(--c-primary-border)] ${
        isActive ? 'border-[var(--c-primary)]' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 cursor-pointer" onClick={onActivate}>
          <h3 className="text-[17px] font-semibold text-[var(--c-ink)]">{portfolio.name}</h3>
          {portfolio.description && (
            <p className="text-[14px] text-[var(--c-ink-mute)] mt-1 line-clamp-2">
              {portfolio.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3">
          <button
            onClick={onEdit}
            className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] rounded-lg hover:bg-[var(--c-canvas-soft)] transition-colors"
            aria-label="Edit"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] rounded-lg hover:bg-[var(--c-bear-bg)] transition-colors"
            aria-label="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-[13px] text-[var(--c-ink-mute)]">
        <div className="flex justify-between">
          <span>Currency</span>
          <span className="font-medium text-[var(--c-ink)]">{portfolio.currency}</span>
        </div>
        <div className="flex justify-between">
          <span>Created</span>
          <span className="font-medium text-[var(--c-ink)]">
            {formatDate(portfolio.created_at, 'short')}
          </span>
        </div>
      </div>

      <button
        onClick={onOpen}
        className="mt-4 w-full flex items-center justify-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium py-2 rounded-xl hover:bg-[var(--c-primary-bg)] transition-colors"
      >
        Open Portfolio <ArrowRight size={16} />
      </button>
    </Card>
  );
}
