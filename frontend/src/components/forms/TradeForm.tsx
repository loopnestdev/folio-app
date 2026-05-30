import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { useForexRate } from '../../hooks/useForex';

// ── Schema — mirrors the backend tradeSchema exactly ──────────────────────────
const tradeSchema = z.object({
  symbol:        z.string().min(1, 'Symbol is required').max(20).transform((v) => v.toUpperCase()),
  security_name: z.string().max(200).optional(),
  exchange:      z.string().max(20).optional(),
  trade_type:    z.enum(['buy', 'sell', 'dividend', 'interest', 'drp', 'split']),
  quantity:      z.coerce.number().positive('Quantity must be positive'),
  price:         z.coerce.number().min(0, 'Price must be non-negative'),
  brokerage:     z.coerce.number().min(0).default(0),
  gst:           z.coerce.number().min(0).default(0),
  currency:      z.string().length(3),
  exchange_rate: z.coerce.number().positive().default(1),
  trade_date:    z.string().min(1, 'Trade date is required'),
  notes:         z.string().max(500).optional(),
});

export type TradeFormValues = z.infer<typeof tradeSchema>;

interface TradeFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TradeFormValues) => Promise<void>;
  portfolioId: string;
  /** Base currency of the portfolio (e.g. 'AUD'). Used to trigger forex lookup. */
  portfolioCurrency?: string;
  /** When provided, form opens in edit mode pre-populated with these values. */
  initialValues?: Partial<TradeFormValues>;
}

const TRADE_TYPE_OPTIONS = [
  { label: 'Buy',      value: 'buy' },
  { label: 'Sell',     value: 'sell' },
  { label: 'Dividend', value: 'dividend' },
  { label: 'Interest', value: 'interest' },
  { label: 'DRP',      value: 'drp' },
  { label: 'Split',    value: 'split' },
];

const CURRENCY_OPTIONS = [
  { label: 'AUD – Australian Dollar', value: 'AUD' },
  { label: 'USD – US Dollar',         value: 'USD' },
  { label: 'EUR – Euro',              value: 'EUR' },
  { label: 'GBP – British Pound',     value: 'GBP' },
  { label: 'HKD – Hong Kong Dollar',  value: 'HKD' },
  { label: 'SGD – Singapore Dollar',  value: 'SGD' },
];

export function TradeForm({ open, onClose, onSubmit, portfolioCurrency = 'AUD', initialValues }: TradeFormProps) {
  const isEditMode = !!initialValues;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<TradeFormValues, any, TradeFormValues>({
    resolver: zodResolver(tradeSchema) as any,
    defaultValues: {
      trade_type:    'buy',
      currency:      portfolioCurrency,
      brokerage:     0,
      gst:           0,
      exchange_rate: 1,
      trade_date:    new Date().toISOString().split('T')[0],
    },
  });

  // When opening in edit mode, reset the form with the trade's existing values
  useEffect(() => {
    if (open && initialValues) {
      reset({
        trade_type:    'buy',
        currency:      portfolioCurrency,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        trade_date:    new Date().toISOString().split('T')[0],
        ...initialValues,
      });
    } else if (!open) {
      reset({
        trade_type:    'buy',
        currency:      portfolioCurrency,
        brokerage:     0,
        gst:           0,
        exchange_rate: 1,
        trade_date:    new Date().toISOString().split('T')[0],
      });
    }
  }, [open, initialValues, reset, portfolioCurrency]);

  const currency      = watch('currency');
  const trade_date    = watch('trade_date');
  const quantity      = watch('quantity');
  const price         = watch('price');
  const brokerage     = watch('brokerage');
  const exchange_rate = watch('exchange_rate');

  const isForeignCurrency = currency !== portfolioCurrency;

  // Forex lookup — fires automatically when currency or date changes
  const { data: forexData, isFetching: forexFetching } = useForexRate(
    isForeignCurrency ? currency : undefined,
    isForeignCurrency ? portfolioCurrency : undefined,
    isForeignCurrency ? trade_date : undefined,
  );

  // Auto-fill exchange_rate from API unless user has overridden it
  useEffect(() => {
    if (forexData?.rate && forexData.rate > 0) {
      setValue('exchange_rate', parseFloat(forexData.rate.toFixed(6)));
    }
  }, [forexData, setValue]);

  // Reset exchange_rate to 1 when switching back to portfolio currency
  useEffect(() => {
    if (!isForeignCurrency) {
      setValue('exchange_rate', 1);
    }
  }, [isForeignCurrency, setValue]);

  const nativeAmount  = (Number(quantity) || 0) * (Number(price) || 0) + (Number(brokerage) || 0);
  const audEquivalent = nativeAmount * (Number(exchange_rate) || 1);

  const handleClose = () => { reset(); onClose(); };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (values: any) => {
    await onSubmit(values as TradeFormValues);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={isEditMode ? 'Edit Trade' : 'Add Trade'} size="lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">

        {/* Symbol + Security name */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Symbol"
            placeholder="e.g. AAPL"
            error={errors.symbol?.message}
            required
            {...register('symbol')}
          />
          <Input
            label="Security Name"
            placeholder="e.g. Apple Inc."
            error={errors.security_name?.message}
            {...register('security_name')}
          />
        </div>

        {/* Trade type */}
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

        {/* Qty / Price / Brokerage */}
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
            label="Brokerage"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            error={errors.brokerage?.message}
            {...register('brokerage')}
          />
        </div>

        {/* Date / Exchange / Currency */}
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Trade Date"
            type="date"
            error={errors.trade_date?.message}
            required
            {...register('trade_date')}
          />
          <Input
            label="Exchange"
            placeholder="ASX / NYSE"
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

        {/* ── Forex section — only when trade currency ≠ portfolio currency ── */}
        {isForeignCurrency && (
          <div className="rounded-xl border border-[var(--c-border)] p-4 space-y-3 bg-[var(--c-canvas-soft)]">
            <p className="text-[13px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-wide">
              FX Conversion ({currency} → {portfolioCurrency})
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label={`1 ${currency} = ? ${portfolioCurrency}`}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1.00"
                  error={errors.exchange_rate?.message}
                  {...register('exchange_rate')}
                />
                {forexFetching && (
                  <p className="mt-1 text-[12px] text-[var(--c-ink-mute)]">Fetching rate…</p>
                )}
                {forexData && !forexFetching && (
                  <p className="mt-1 text-[12px] text-[var(--c-ink-mute)]">
                    Rate at {forexData.date}: {forexData.rate.toFixed(4)} (auto-filled, editable)
                  </p>
                )}
              </div>

              {/* AUD equivalent preview */}
              {audEquivalent > 0 && (
                <div className="flex flex-col justify-center">
                  <p className="text-[12px] text-[var(--c-ink-mute)] mb-1">{portfolioCurrency} equivalent</p>
                  <p className="text-[18px] font-semibold text-[var(--c-ink)]">
                    {new Intl.NumberFormat('en-AU', {
                      style: 'currency',
                      currency: portfolioCurrency,
                      minimumFractionDigits: 2,
                    }).format(audEquivalent)}
                  </p>
                  <p className="text-[12px] text-[var(--c-ink-mute)] mt-0.5">
                    Used for CGT cost base (ATO)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Total preview (native currency) */}
        {nativeAmount > 0 && (
          <div className="bg-[var(--c-canvas-soft)] rounded-xl p-3 text-[15px]">
            <span className="text-[var(--c-ink-mute)]">Total ({currency}): </span>
            <span className="font-semibold text-[var(--c-ink)]">
              {new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2 }).format(nativeAmount)}
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
            {isEditMode ? 'Save Changes' : 'Add Trade'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
