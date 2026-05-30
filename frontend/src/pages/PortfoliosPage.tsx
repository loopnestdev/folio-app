import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ArrowRight, Briefcase } from 'lucide-react';
import { usePortfolios, useCreatePortfolio, useUpdatePortfolio, useDeletePortfolio } from '../hooks/usePortfolio';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal, ModalActions } from '../components/ui/Modal';
import { PortfolioForm, type PortfolioFormValues } from '../components/forms/PortfolioForm';
import { useToast } from '../components/ui/Toast';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { formatDate } from '../lib/utils';
import type { Portfolio } from '../types';

export function PortfoliosPage() {
  const { data: portfolios = [], isLoading } = usePortfolios();
  const { activePortfolio, setActivePortfolio } = usePortfolioContext();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const toast = useToast();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Portfolio | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Portfolio | null>(null);

  const updatePortfolio = useUpdatePortfolio(editTarget?.id ?? '');

  const handleCreate = async (values: PortfolioFormValues) => {
    try {
      await createPortfolio.mutateAsync({ ...values, description: values.description ?? null });
      toast.success('Portfolio created', `"${values.name}" is ready.`);
      setCreateOpen(false);
    } catch {
      toast.error('Failed to create portfolio');
    }
  };

  const handleEdit = async (values: PortfolioFormValues) => {
    if (!editTarget) return;
    try {
      await updatePortfolio.mutateAsync(values);
      toast.success('Portfolio updated');
      setEditTarget(null);
    } catch {
      toast.error('Failed to update portfolio');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePortfolio.mutateAsync(deleteTarget.id);
      toast.success('Portfolio deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete portfolio');
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Portfolios</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">Manage your investment portfolios</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          New Portfolio
        </Button>
      </div>

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-[var(--c-primary-bg)] rounded-full flex items-center justify-center">
            <Briefcase size={28} className="text-[var(--c-primary)]" />
          </div>
          <div className="text-center">
            <h2 className="text-[20px] font-semibold text-[var(--c-ink)] mb-2">No portfolios yet</h2>
            <p className="text-[15px] text-[var(--c-ink-mute)]">Create your first portfolio to get started.</p>
          </div>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreateOpen(true)}>
            Create Portfolio
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((portfolio) => (
            <Card
              key={portfolio.id}
              className={`cursor-pointer transition-all hover:border-[var(--c-primary-border)] ${
                activePortfolio?.id === portfolio.id ? 'border-[var(--c-primary)]' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="flex-1"
                  onClick={() => {
                    setActivePortfolio(portfolio);
                    navigate('/');
                  }}
                >
                  <h3 className="text-[17px] font-semibold text-[var(--c-ink)]">{portfolio.name}</h3>
                  {portfolio.description && (
                    <p className="text-[14px] text-[var(--c-ink-mute)] mt-1 line-clamp-2">
                      {portfolio.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => setEditTarget(portfolio)}
                    className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] rounded-lg hover:bg-[var(--c-canvas-soft)] transition-colors"
                    aria-label="Edit"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(portfolio)}
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
                  <span className="font-medium text-[var(--c-ink)]">{formatDate(portfolio.created_at, 'short')}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActivePortfolio(portfolio);
                  navigate(`/portfolios/${portfolio.id}/holdings`);
                }}
                className="mt-4 w-full flex items-center justify-center gap-1.5 text-[15px] text-[var(--c-primary)] font-medium py-2 rounded-xl hover:bg-[var(--c-primary-bg)] transition-colors"
              >
                Open Portfolio <ArrowRight size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      <PortfolioForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        mode="create"
      />

      {/* Edit modal */}
      {editTarget && (
        <PortfolioForm
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleEdit}
          defaultValues={editTarget}
          mode="edit"
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Portfolio"
        size="sm"
      >
        <p className="text-[15px] text-[var(--c-ink)]">
          Are you sure you want to delete{' '}
          <strong>"{deleteTarget?.name}"</strong>? This will permanently delete all trades and data
          associated with this portfolio.
        </p>
        <ModalActions>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deletePortfolio.isPending}
          >
            Delete Portfolio
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
