import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useTrades, useAddTrade, useDeleteTrade } from '../hooks/usePortfolio';
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
  buy:      'info',
  sell:     'warning',
  dividend: 'success',
  interest: 'success',
  drp:      'info',
  split:    'neutral',
};

export function TradesPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId     = id || activePortfolio?.id || '';
  const portfolioCurrency = activePortfolio?.currency || 'AUD';

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState<BackendTradeType | ''>('');

  const { data: trades = [], isLoading } = useTrades(portfolioId, {
    symbol:     filterSymbol || undefined,
    trade_type: filterType   || undefined,
  });

  const addTrade   = useAddTrade(portfolioId);
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
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
          className="p-1.5 text-[var(--c-ink-mute)] hover:text-[var(--c-bear)] rounded-lg hover:bg-[var(--c-bear-bg)] transition-colors"
          aria-label="Delete trade"
        >
          <Trash2 size={14} />
        </button>
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
            { label: 'All types',  value: '' },
            { label: 'Buy',        value: 'buy' },
            { label: 'Sell',       value: 'sell' },
            { label: 'Dividend',   value: 'dividend' },
            { label: 'Interest',   value: 'interest' },
            { label: 'DRP',        value: 'drp' },
            { label: 'Split',      value: 'split' },
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
