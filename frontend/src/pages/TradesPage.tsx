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
import { formatCurrency, formatDate, getValueColor } from '../lib/utils';
import type { Trade, TradeDirection, TradeType } from '../types';

export function TradesPage() {
  const { id } = useParams<{ id: string }>();
  const { activePortfolio } = usePortfolioContext();
  const portfolioId = id || activePortfolio?.id || '';
  const currency = activePortfolio?.currency || 'USD';

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterDirection, setFilterDirection] = useState<TradeDirection | ''>('');
  const [filterType, setFilterType] = useState<TradeType | ''>('');

  const { data: trades = [], isLoading } = useTrades(portfolioId, {
    symbol: filterSymbol || undefined,
    direction: filterDirection || undefined,
    trade_type: filterType || undefined,
  });

  const addTrade = useAddTrade(portfolioId);
  const deleteTrade = useDeleteTrade(portfolioId);
  const toast = useToast();

  const handleAdd = async (values: TradeFormValues) => {
    try {
      await addTrade.mutateAsync({
        ...values,
        amount: values.quantity * values.price + (values.fees || 0),
        settlement_date: null,
        notes: values.notes || null,
        security_name: values.security_name || null,
        exchange: values.exchange || null,
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

  const columns = [
    {
      key: 'trade_date',
      label: 'Date',
      sortable: true,
      render: (v: unknown) => formatDate(String(v), 'medium'),
    },
    {
      key: 'symbol',
      label: 'Symbol',
      sortable: true,
      render: (v: unknown) => <span className="font-semibold text-[var(--c-primary)]">{String(v)}</span>,
    },
    {
      key: 'security_name',
      label: 'Security',
      render: (v: unknown) => String(v || '—'),
    },
    {
      key: 'direction',
      label: 'Direction',
      render: (v: unknown) => {
        const isBuy = v === 'BUY';
        return (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: isBuy ? 'var(--c-bull)' : 'var(--c-bear)' }}
          >
            {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {String(v)}
          </span>
        );
      },
    },
    {
      key: 'trade_type',
      label: 'Type',
      render: (v: unknown) => {
        const map: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
          TRADE: 'info',
          DIVIDEND: 'success',
          INTEREST: 'success',
          FEE: 'warning',
          DEPOSIT: 'success',
          WITHDRAWAL: 'warning',
        };
        return <Badge variant={map[String(v)] || 'neutral'}>{String(v)}</Badge>;
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
      render: (v: unknown) => formatCurrency(Number(v), currency),
    },
    {
      key: 'amount',
      label: 'Total',
      align: 'right' as const,
      sortable: true,
      render: (v: unknown, row: Trade) => (
        <span style={{ color: getValueColor(row.direction === 'BUY' ? -Number(v) : Number(v)) }}>
          {formatCurrency(Number(v), currency)}
        </span>
      ),
    },
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
          <p className="text-[15px] text-[var(--c-ink-mute)] mt-1">{trades.length} transaction{trades.length !== 1 ? 's' : ''}</p>
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
            { label: 'All directions', value: '' },
            { label: 'Buy', value: 'BUY' },
            { label: 'Sell', value: 'SELL' },
          ]}
          value={filterDirection}
          onChange={(v) => setFilterDirection(v as TradeDirection | '')}
          containerClassName="w-44"
        />
        <Select
          options={[
            { label: 'All types', value: '' },
            { label: 'Trade', value: 'TRADE' },
            { label: 'Dividend', value: 'DIVIDEND' },
            { label: 'Interest', value: 'INTEREST' },
            { label: 'Fee', value: 'FEE' },
            { label: 'Deposit', value: 'DEPOSIT' },
            { label: 'Withdrawal', value: 'WITHDRAWAL' },
          ]}
          value={filterType}
          onChange={(v) => setFilterType(v as TradeType | '')}
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
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Trade"
        size="sm"
      >
        <p className="text-[15px] text-[var(--c-ink)]">
          Delete the <strong>{deleteTarget?.direction}</strong> trade for{' '}
          <strong>{deleteTarget?.symbol}</strong> on{' '}
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
