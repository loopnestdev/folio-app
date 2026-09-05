import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown } from 'lucide-react';
import { useTrades, useAddTrade, useUpdateTrade, useDeleteTrade } from '../hooks/usePortfolio';
import { usePortfolioContext } from '../contexts/PortfolioContext';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal, ModalActions } from '../components/ui/Modal';
import { TradeForm, type TradeFormValues } from '../components/forms/TradeForm';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/Toast';
import { formatCurrency, formatDate } from '../lib/utils';
import type { Trade, BackendTradeType } from '../types';

const TRADE_TYPE_BADGE: Record<BackendTradeType, 'success' | 'info' | 'warning' | 'neutral'> = {
  buy:         'info',
  sell:        'warning',
  dividend:    'success',
  interest:    'success',
  other_income: 'success',
  drp:         'info',
  split:       'neutral',
  deposit:     'success',
  withdrawal:  'warning',
  transfer_in: 'info',
};

export function TradesPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId     = id || activePortfolio?.id || '';
  const portfolioCurrency = activePortfolio?.currency || 'AUD';

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Trade | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState<BackendTradeType | ''>('');

  // Fetch the full trade history in one request (limit 2000).
  // Both type and symbol filtering are applied client-side to avoid network
  // round-trips on every keystroke or dropdown change.
  const { data: allTrades = [], isLoading } = useTrades(portfolioId);

  const trades = allTrades
    .filter((t) => !filterType   || t.trade_type === filterType)
    .filter((t) => !filterSymbol || (t.security?.symbol?.toUpperCase().includes(filterSymbol)));

  const addTrade    = useAddTrade(portfolioId);
  const updateTrade = useUpdateTrade(portfolioId);
  const deleteTrade = useDeleteTrade(portfolioId);
  const toast = useToast();

  const handleAdd = async (values: TradeFormValues) => {
    try {
      await addTrade.mutateAsync({
        trade_date:    values.trade_date,
        trade_type:    values.trade_type,
        symbol:        values.symbol,
        security_name: values.security_name,
        exchange:      values.exchange,
        quantity:      values.quantity,
        price:         values.price,
        brokerage:     values.brokerage ?? 0,
        gst:           values.gst ?? 0,
        currency:      values.currency,
        exchange_rate: values.exchange_rate ?? 1,
        notes:         values.notes || null,
      });
      toast.success('Trade added');
      setAddOpen(false);
    } catch {
      toast.error('Failed to add trade');
    }
  };

  const handleEdit = async (values: TradeFormValues) => {
    if (!editTarget) return;
    try {
      await updateTrade.mutateAsync({ tradeId: editTarget.id, payload: values });
      toast.success('Trade updated');
      setEditTarget(null);
    } catch {
      toast.error('Failed to update trade');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTrade.mutateAsync(deleteTarget.id);
      toast.success('Trade deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete trade');
    }
  };

  // Whether any trade in the list is in a foreign currency
  const hasForeignTrades = trades.some((t) => t.currency !== portfolioCurrency);

  const columns = [
    {
      key: 'trade_date',
      label: 'Date',
      sortable: true,
      render: (v: unknown) => formatDate(String(v), 'medium'),
    },
    {
      key: 'security',
      label: 'Symbol',
      sortable: true,
      render: (_v: unknown, row: Trade) => (
        <span className="font-semibold text-[var(--c-primary)]">
          {row.security?.symbol ?? '—'}
        </span>
      ),
    },
    {
      key: 'security_name',
      label: 'Security',
      render: (_v: unknown, row: Trade) => String(row.security?.name ?? '—'),
    },
    {
      key: 'trade_type',
      label: 'Type',
      render: (v: unknown) => {
        const t = v as BackendTradeType;
        const isBuy = t === 'buy' || t === 'drp';
        return (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: isBuy ? 'var(--c-bull)' : t === 'sell' ? 'var(--c-bear)' : 'var(--c-ink-mute)' }}
          >
            {t === 'buy'  && <TrendingUp size={14} />}
            {t === 'sell' && <TrendingDown size={14} />}
            <Badge variant={TRADE_TYPE_BADGE[t] ?? 'neutral'}>{t.toUpperCase()}</Badge>
          </span>
        );
      },
    },
    {
      key: 'quantity',
      label: 'Qty',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown) => Number(v).toLocaleString(),
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right' as const,
      sortable: true,
      render: (_v: unknown, row: Trade) =>
        formatCurrency(row.price, row.currency),
    },
    {
      key: 'brokerage',
      label: 'Brokerage',
      align: 'right' as const,
      render: (_v: unknown, row: Trade) =>
        row.brokerage > 0 ? formatCurrency(row.brokerage, row.currency) : '—',
    },
    // FX rate column — only shown when at least one trade is in a foreign currency
    ...(hasForeignTrades ? [{
      key: 'exchange_rate',
      label: 'FX Rate',
      align: 'right' as const,
      render: (_v: unknown, row: Trade) =>
        row.currency !== portfolioCurrency
          ? `${row.exchange_rate.toFixed(4)} ${portfolioCurrency}/${row.currency}`
          : '—',
    }] : []),
    {
      key: 'id',
      label: '',
      render: (_v: unknown, row: Trade) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditTarget(row); }}
            className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-primary)] rounded-lg hover:bg-[var(--c-primary-bg)] transition-colors"
            aria-label="Edit trade"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] rounded-lg hover:bg-[var(--c-bear-bg)] transition-colors"
            aria-label="Delete trade"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)]">Trades</h1>
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">
            {trades.length} transaction{trades.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setAddOpen(true)}>
          Add Trade
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Filter by symbol…"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
          containerClassName="w-44"
        />
        <Select
          options={[
            { label: 'All types',    value: '' },
            { label: 'Buy',          value: 'buy' },
            { label: 'Sell',         value: 'sell' },
            { label: 'Transfer In',  value: 'transfer_in' },
            { label: 'Dividend',     value: 'dividend' },
            { label: 'Interest',     value: 'interest' },
            { label: 'Other Income', value: 'other_income' },
            { label: 'DRP',          value: 'drp' },
            { label: 'Split',        value: 'split' },
            { label: 'Deposit',      value: 'deposit' },
            { label: 'Withdrawal',   value: 'withdrawal' },
          ]}
          value={filterType}
          onChange={(v) => setFilterType(v as BackendTradeType | '')}
          containerClassName="w-44"
        />
      </div>

      <Card padding="none">
        <Table<Trade>
          columns={columns as Parameters<typeof Table<Trade>>[0]['columns']}
          data={trades}
          keyField="id"
          emptyMessage="No trades found"
        />
      </Card>

      <TradeForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
        portfolioId={portfolioId}
        portfolioCurrency={portfolioCurrency}
      />

      <TradeForm
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        portfolioId={portfolioId}
        portfolioCurrency={portfolioCurrency}
        initialValues={editTarget ? {
          trade_date:    editTarget.trade_date,
          trade_type:    editTarget.trade_type,
          symbol:        editTarget.security?.symbol ?? '',
          security_name: editTarget.security?.name ?? '',
          exchange:      editTarget.security?.exchange ?? '',
          quantity:      editTarget.quantity,
          price:         editTarget.price,
          brokerage:     editTarget.brokerage ?? 0,
          gst:           editTarget.gst ?? 0,
          currency:      editTarget.currency,
          exchange_rate: editTarget.exchange_rate ?? 1,
          notes:         editTarget.notes ?? '',
        } : undefined}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Trade"
        size="sm"
      >
        <p className="text-[15px] text-[var(--c-ink)]">
          Delete the <strong>{deleteTarget?.trade_type?.toUpperCase()}</strong> trade for{' '}
          <strong>{deleteTarget?.security?.symbol ?? deleteTarget?.security_id}</strong> on{' '}
          {deleteTarget && formatDate(deleteTarget.trade_date, 'medium')}?
        </p>
        <ModalActions>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deleteTrade.isPending}
          >
            Delete
          </Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
