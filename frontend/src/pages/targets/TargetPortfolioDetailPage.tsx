import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, BarChart2, CheckCircle, AlertTriangle,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
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
import { formatCurrency } from '../../lib/utils';

interface DraftItem {
  key: string; // local-only stable key for list rendering
  symbol: string;
  exchange: string;
  category: string;
  allocation_pct: string; // keep as string while editing
}

let _nextKey = 0;
const newKey = () => String(++_nextKey);

// Legacy per-portfolio localStorage key for the investable amount, from before it was saved on the
// target portfolio; only read to seed a portfolio that has no saved amount yet.
const STORAGE_KEY_INVESTABLE = 'folio_target_investable_';
const DEFAULT_INVESTABLE = '100000';

export type SortKey = 'category' | 'allocation';
export type SortDir = 'asc' | 'desc';

// Pure reorder helper — sorts a copy of the draft rows by category (alpha) or
// allocation (numeric). Rows with a blank category always sink to the bottom,
// regardless of direction, so half-filled rows don't wander into the middle.
export function sortDraftItems<T extends { category: string; allocation_pct: string }>(
  rows: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'allocation') {
      return factor * ((parseFloat(a.allocation_pct) || 0) - (parseFloat(b.allocation_pct) || 0));
    }
    const av = a.category.trim().toLowerCase();
    const bv = b.category.trim().toLowerCase();
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return factor * av.localeCompare(bv);
  });
}

// Dollar value of an allocation percentage against a hypothetical investable
// capital — simply pct/100 * capital, with non-numeric input treated as 0.
export function allocationValue(pct: string | number, capital: number): number {
  const p = typeof pct === 'string' ? parseFloat(pct) : pct;
  return ((Number.isFinite(p) ? p : 0) / 100) * capital;
}

// Field label shown above each input on phones; hidden from sm, where the grid's column headers label the fields.
const MOBILE_LABEL = 'block mb-1 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide sm:hidden';

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
  const [sort, setSort]     = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [investable, setInvestable] = useState(DEFAULT_INVESTABLE);
  const [currency, setCurrency]     = useState('USD');

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
    setInvestable(
      tp.investable_amount != null
        ? String(tp.investable_amount)
        : (localStorage.getItem(`${STORAGE_KEY_INVESTABLE}${tp.id}`) ?? DEFAULT_INVESTABLE),
    );
    setCurrency(tp.investable_currency || 'USD');
    setDirty(false);
    setSort(null);
  }, [tp]);

  const totalAlloc = items.reduce((s, i) => s + (parseFloat(i.allocation_pct) || 0), 0);
  const allocOk    = Math.abs(totalAlloc - 100) < 0.01;
  const investableNum = Math.max(parseFloat(investable) || 0, 0);

  const handleInvestableChange = (v: string) => {
    setInvestable(v);
    setDirty(true);
  };

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

  // Header click: sort by that column, toggling asc → desc on repeat clicks.
  // A one-shot reorder (not a live sorted view) so editing a cell mid-sort
  // doesn't make rows jump around under the cursor. New order persists on save
  // via sort_order.
  const handleSort = (key: SortKey) => {
    const dir: SortDir = sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc';
    setSort({ key, dir });
    setItems((prev) => sortDraftItems(prev, key, dir));
    setDirty(true);
  };

  const sortIcon = (key: SortKey) => {
    if (sort?.key !== key) return <ChevronsUpDown size={12} className="opacity-40" />;
    return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const handleSave = async () => {
    // Validate: skip empty rows (user may have started a row but not filled it)
    const validItems = items.filter((i) => i.symbol.trim() && parseFloat(i.allocation_pct) > 0);

    try {
      // Save name / description / investable amount if changed
      const investableValue = investable.trim() === '' ? null : investableNum;
      if (tp && (
        name !== tp.name || desc !== (tp.description ?? '') ||
        investableValue !== (tp.investable_amount != null ? Number(tp.investable_amount) : null) ||
        currency !== tp.investable_currency
      )) {
        await updateMutation.mutateAsync({
          name: name.trim(),
          description: desc.trim() || null,
          investable_amount: investableValue,
          investable_currency: currency,
        });
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header — title row, then a toolbar that wraps under it on phones */}
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
            <h1 className="text-xl font-bold text-[var(--c-ink)] truncate">{tp.name}</h1>
            <p className="text-[13px] text-[var(--c-ink-mute)]">Target Portfolio</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor="investable" className="text-[12px] text-[var(--c-ink-mute)] whitespace-nowrap">
            Investable
          </label>
          <select
            aria-label="Investable currency"
            value={currency}
            onChange={(e) => { setCurrency(e.target.value); setDirty(true); }}
            className="h-9 px-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]"
          >
            {['USD', 'AUD', 'HKD'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-[var(--c-ink-mute)]">$</span>
            <input
              id="investable"
              type="number"
              min="0"
              step="1000"
              value={investable}
              onChange={(e) => handleInvestableChange(e.target.value)}
              className="w-28 h-9 pl-5 pr-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] text-right tnum focus:outline-none focus:border-[var(--c-primary)]"
            />
          </div>
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
      </div>

      {/* Name & description */}
      <Card padding="sm" className="sm:p-5 space-y-4">
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
      <Card padding="sm" className="sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[15px] text-[var(--c-ink)]">Holdings</h2>
          <div className="flex items-center gap-3">
            {/* Allocated dollars vs investable capital */}
            <span className="hidden sm:inline text-[12px] text-[var(--c-ink-mute)] tnum">
              {formatCurrency(allocationValue(totalAlloc, investableNum), currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              {' of '}
              {formatCurrency(investableNum, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            {/* Allocation total badge */}
            <span
              className={[
                'text-[13px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap tnum',
                allocOk
                  ? 'bg-[var(--c-bull-bg)] text-[var(--c-bull)]'
                  : Math.abs(totalAlloc - 100) < 5
                  ? 'bg-[var(--c-warn-bg)] text-[var(--c-warn)]'
                  : 'bg-[var(--c-bear-bg)] text-[var(--c-bear)]',
              ].join(' ')}
            >
              {totalAlloc.toFixed(1)}% / 100%
            </span>
            <Button variant="secondary" size="sm" onClick={addRow} className="whitespace-nowrap">
              <Plus size={14} className="mr-1" /> Add Row
            </Button>
          </div>
        </div>

        {!allocOk && items.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-[var(--c-warn-border)] bg-[var(--c-warn-bg)] text-[var(--c-ink)] text-[13px]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--c-warn)]" />
            <span>
              Allocations must total exactly 100%. Currently at {totalAlloc.toFixed(1)}%.
            </span>
          </div>
        )}

        {/* Single flat grid — headers and inputs share identical column widths.
            Phones: one labelled card per holding. From sm: each card wrapper is display:contents, so its cells join the 6-column grid. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1.3fr_1.6fr_0.9fr_1fr_2rem] sm:gap-x-2 sm:gap-y-2 sm:items-center">
          {/* Column headers (desktop only — phones label each field) */}
          {items.length > 0 && (
            <div className="hidden sm:contents">
              <span className="pl-3 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Symbol</span>
              <span className="pl-3 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">Exchange</span>
              <button
                type="button"
                onClick={() => handleSort('category')}
                className="pl-3 flex items-center gap-1 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide hover:text-[var(--c-ink)] transition-colors"
              >
                Category {sortIcon('category')}
              </button>
              <button
                type="button"
                onClick={() => handleSort('allocation')}
                className="pr-3 flex items-center justify-end gap-1 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide hover:text-[var(--c-ink)] transition-colors"
              >
                Alloc % {sortIcon('allocation')}
              </button>
              <span className="pr-3 text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide text-right">Alloc $</span>
              <span />
            </div>
          )}

          {/* Phones: sort controls, since the column headers are hidden */}
          {items.length > 1 && (
            <div className="flex items-center gap-2 sm:hidden text-[12px] text-[var(--c-ink-mute)]">
              <span>Sort:</span>
              <button type="button" onClick={() => handleSort('category')} className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--c-border)] hover:text-[var(--c-ink)]">
                Category {sortIcon('category')}
              </button>
              <button type="button" onClick={() => handleSort('allocation')} className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--c-border)] hover:text-[var(--c-ink)]">
                Alloc % {sortIcon('allocation')}
              </button>
            </div>
          )}

          {/* Data rows */}
          {items.map((item) => (
            <div key={item.key} className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-[var(--c-border)] sm:contents">
              <label className="block sm:contents">
              <span className={MOBILE_LABEL}>Symbol</span>
              <input
                className="w-full h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)] uppercase"
                placeholder="NVDA"
                value={item.symbol}
                onChange={(e) => updateItem(item.key, 'symbol', e.target.value)}
              />
              </label>
              <label className="block sm:contents">
              <span className={MOBILE_LABEL}>Exchange</span>
              <input
                className="w-full h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]"
                placeholder="NASDAQ"
                value={item.exchange}
                onChange={(e) => updateItem(item.key, 'exchange', e.target.value)}
              />
              </label>
              <label className="block sm:contents">
              <span className={MOBILE_LABEL}>Category</span>
              <input
                className="w-full h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)]"
                placeholder="Semi"
                value={item.category}
                onChange={(e) => updateItem(item.key, 'category', e.target.value)}
              />
              </label>
              <label className="block sm:contents">
              <span className={MOBILE_LABEL}>Alloc %</span>
              <input
                className="w-full h-9 px-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-canvas)] text-[16px] sm:text-[14px] text-[var(--c-ink)] focus:outline-none focus:border-[var(--c-primary)] text-right"
                placeholder="9"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={item.allocation_pct}
                onChange={(e) => updateItem(item.key, 'allocation_pct', e.target.value)}
              />
              </label>
              <span className="h-9 flex items-center sm:justify-end sm:px-3 text-[14px] text-[var(--c-ink-sec)] tnum">
                <span className="sm:hidden mr-1.5 text-[12px] text-[var(--c-ink-mute)]">Alloc $</span>
                {formatCurrency(allocationValue(item.allocation_pct, investableNum), currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <button
                onClick={() => removeItem(item.key)}
                aria-label={`Remove ${item.symbol || 'row'}`}
                className="justify-self-end flex items-center justify-center w-8 h-8 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {items.length === 0 && (
            <div className="sm:col-span-6 text-center py-8 text-[14px] text-[var(--c-ink-mute)]">
              No stocks added yet. Click "Add Row" to start.
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!dirty || updateMutation.isPending || itemsMutation.isPending} className="w-full sm:w-auto">
            <Save size={15} className="mr-1.5" />
            {itemsMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
