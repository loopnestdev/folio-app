import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';

const tradeSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').max(20).transform((v) => v.toUpperCase()),
  security_name: z.string().max(200).optional(),
  exchange: z.string().max(20).optional(),
  direction: z.enum(['BUY', 'SELL']),
  trade_type: z.enum(['TRADE', 'DIVIDEND', 'INTEREST', 'FEE', 'DEPOSIT', 'WITHDRAWAL']),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  fees: z.coerce.number().min(0, 'Fees must be non-negative').default(0),
  currency: z.string().min(1),
  trade_date: z.string().min(1, 'Trade date is required'),
  notes: z.string().max(500).optional(),
});

type TradeFormValues = z.infer<typeof tradeSchema>;

interface TradeFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TradeFormValues) => Promise<void>;
  portfolioId: string;
}

const DIRECTION_OPTIONS = [
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
];

const TRADE_TYPE_OPTIONS = [
  { label: 'Trade (Buy/Sell)', value: 'TRADE' },
  { label: 'Dividend', value: 'DIVIDEND' },
  { label: 'Interest', value: 'INTEREST' },
  { label: 'Fee', value: 'FEE' },
  { label: 'Deposit', value: 'DEPOSIT' },
  { label: 'Withdrawal', value: 'WITHDRAWAL' },
];

const CURRENCY_OPTIONS = [
  { label: 'USD', value: 'USD' },
  { label: 'AUD', value: 'AUD' },
  { label: 'EUR', value: 'EUR' },
  { label: 'GBP', value: 'GBP' },
];

export function TradeForm({ open, onClose, onSubmit }: TradeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<TradeFormValues, any, TradeFormValues>({
    resolver: zodResolver(tradeSchema) as any,
    defaultValues: {
      direction: 'BUY',
      trade_type: 'TRADE',
      currency: 'USD',
      fees: 0,
      trade_date: new Date().toISOString().split('T')[0],
    },
  });

  const quantity = watch('quantity');
  const price = watch('price');
  const fees = watch('fees');
  const totalAmount = (Number(quantity) || 0) * (Number(price) || 0) + (Number(fees) || 0);

  const handleClose = () => {
    reset();
    onClose();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (values: any) => {
    await onSubmit(values);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Trade" size="lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Symbol"
            placeholder="e.g., AAPL"
            error={errors.symbol?.message}
            required
            {...register('symbol')}
          />
          <Input
            label="Security Name"
            placeholder="e.g., Apple Inc."
            error={errors.security_name?.message}
            {...register('security_name')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <Select
                label="Direction"
                options={DIRECTION_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                error={errors.direction?.message}
                required
              />
            )}
          />
          <Controller
            control={control}
            name="trade_type"
            render={({ field }) => (
              <Select
                label="Trade Type"
                options={TRADE_TYPE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                error={errors.trade_type?.message}
                required
              />
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Quantity"
            type="number"
            step="any"
            min="0"
            placeholder="100"
            error={errors.quantity?.message}
            required
            {...register('quantity')}
          />
          <Input
            label="Price"
            type="number"
            step="any"
            min="0"
            placeholder="150.00"
            error={errors.price?.message}
            required
            {...register('price')}
          />
          <Input
            label="Fees"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            error={errors.fees?.message}
            {...register('fees')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Trade Date"
            type="date"
            error={errors.trade_date?.message}
            required
            {...register('trade_date')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Exchange"
              placeholder="NYSE"
              error={errors.exchange?.message}
              {...register('exchange')}
            />
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  label="Currency"
                  options={CURRENCY_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </div>

        {/* Total preview */}
        {totalAmount > 0 && (
          <div className="bg-[var(--c-canvas-soft)] rounded-xl p-3 text-[15px]">
            <span className="text-[var(--c-ink-mute)]">Total amount: </span>
            <span className="font-semibold text-[var(--c-ink)]">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAmount)}
            </span>
          </div>
        )}

        <Input
          label="Notes"
          placeholder="Optional notes"
          error={errors.notes?.message}
          {...register('notes')}
        />

        <ModalActions>
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            Add Trade
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

export type { TradeFormValues };
