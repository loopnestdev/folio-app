import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, BarChart2, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  useTargetPortfolio,
  useUpdateTargetPortfolio,
  useSetTargetPortfolioItems,
  useActivateTargetPortfolio,
} from '../../hooks/useTargetPortfolios';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';

interface DraftItem {
  key: string; // local-only stable key for list rendering
  symbol: string;
  exchange: string;
  category: string;
  allocation_pct: string; // keep as string while editing
}

let _nextKey = 0;
const newKey = () => String(++_nextKey);

export function TargetPortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const { data: tp, isLoading } = useTargetPortfolio(id);
  const updateMutation   = useUpdateTargetPortfolio(id!);
  const itemsMutation    = useSetTargetPortfolioItems(id!);
  const activateMutation = useActivateTargetPortfolio();

  const [name, setName]     = useState('');
  const [desc, setDesc]     = useState('');
  const [items, setItems]   = useState<DraftItem[]>([]);
  const [dirty, setDirty]   = useState(false);

  // Initialise form from loaded data
  useEffect(() => {
    if (!tp) return;
    setName(tp.name);
    setDesc(tp.description ?? '');
    setItems(
      tp.items.map((i) => ({
        key:            newKey(),
        symbol:         i.symbol,
        exchange:       i.exchange ?? '',
        category:       i.category ?? '',
        allocation_pct: String(i.allocation_pct),
      })),
    );
    setDirty(false);
  }, [tp]);

  const totalAlloc = items.reduce((s, i) => s + (parseFloat(i.allocation_pct) || 0), 0);
  const allocOk    = Math.abs(totalAlloc - 100) < 0.01;

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      { key: newKey(), symbol: '', exchange: '', category: '', allocation_pct: '' },
    ]);
    setDirty(true);
  };

  const updateItem = (key: string, field: keyof DraftItem, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: field === 'symbol' ? value.toUpperCase() : value } : item,
      ),
    );
    setDirty(true);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    setDirty(true);
  };

  const handleSave = async () => {
    // Validate: skip empty rows (user may have started a row but not filled it)
    const validItems = items.filter((i) => i.symbol.trim() && parseFloat(i.allocation_pct) > 0);

    try {
      // Save name/description if changed
      if (tp && (name !== tp.name || desc !== (tp.description ?? ''))) {
        await updateMutation.mutateAsync({ name: name.trim(), description: desc.trim() || null });
      }

      // Save items
      await itemsMutation.mutateAsync(
        validItems.map((i, idx) => ({
          symbol:         i.symbol.trim().toUpperCase(),
          exchange:       i.exchange.trim() || null,
          category:       i.category.trim() || null,
          allocation_pct: parseFloat(i.allocation_pct),
          sort_order:     idx,
        })),
      );

      setDirty(false);
      success('Portfolio saved');
    } catch {
      error('Failed to save');
    }
  };

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync(id!);
      success('Set as active portfolio');
    } catch {
      error('Failed to activate');
    }
  };

  if (isLoading || !tp) return <PageLoader />;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/target-portfolios')}
          className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--c-ink)] truncate">{tp.name}</h1>
          <p className="text-[13px] text-[var(--c-ink-mute)]">Target Portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          {tp.is_active ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[var(--c-primary-bg)] text-[var(--c-primary)]">
              <CheckCircle size={12} /> Active
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleActivate} disabled={activateMutation.isPending}>
              Set Active
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/target-portfolios/${id}/rebalance`)}
          >
            <BarChart2 size={14} className="mr-1.5" /> Rebalance
          </Button>
        </div>
      </div>

      {/* Name & description */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Portfolio name"
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
          />
          <Input
            label="Description (optional)"
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setDirty(true); }}
          />
        </div>
      </Card>

      {/* Items table */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Holdings</h2>
          <div className="flex items-center gap-3">
            {/* Allocation total badge */}
            <span
              className={[
                'text-[13px] font-semibold px-2.5 py-0.5 rounded-full',
                allocOk
                  ? 'bg-emerald-100 text-emerald-700'
                  : Math.abs(totalAlloc - 100) < 5
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700',
              ].join(' ')}
            >
              {totalAlloc.toFixed(1)}% / 100%
            </span>
            <Button variant="secondary" size="sm" onClick={addRow}>
              <Plus size={14} className="mr-1" /> Add Row
            </Button>
          </div>
        </div>

        {!allocOk && items.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-[13px]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              Allocations must total exactly 100%. Currently at {totalAlloc.toFixed(1)}%.
            </span>
          </div>
        )}

        {/* Column headers */}
        {items.length > 0 && (
          <div className="grid grid-cols-[2fr_1.5fr_2fr_1.2fr_auto] gap-2 px-1">
            <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Symbol</span>
            <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Exchange</span>
            <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Category</span>
            <span className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide text-right">Alloc %</span>
            <span />
          </div>
        )}

        {/* Rows */}
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.key} className="grid grid-cols-[2fr_1.5fr_2fr_1.2fr_auto] gap-2 items-center">
              <input
                className="h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)] uppercase"
                placeholder="NVDA"
                value={item.symbol}
                onChange={(e) => updateItem(item.key, 'symbol', e.target.value)}
              />
              <input
                className="h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]"
                placeholder="NASDAQ"
                value={item.exchange}
                onChange={(e) => updateItem(item.key, 'exchange', e.target.value)}
              />
              <input
                className="h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]"
                placeholder="Semi"
                value={item.category}
                onChange={(e) => updateItem(item.key, 'category', e.target.value)}
              />
              <input
                className="h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)] text-right"
                placeholder="9"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={item.allocation_pct}
                onChange={(e) => updateItem(item.key, 'allocation_pct', e.target.value)}
              />
              <button
                onClick={() => removeItem(item.key)}
                className="p-2 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8 text-[14px] text-[var(--c-ink-mute)]">
              No stocks added yet. Click "Add Row" to start.
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!dirty || updateMutation.isPending || itemsMutation.isPending}>
            <Save size={15} className="mr-1.5" />
            {itemsMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
