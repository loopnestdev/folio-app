import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Textarea } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import type { PortfolioGroup } from '../../types';

const groupSchema = z.object({
  name:          z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  description:   z.string().max(500, 'Description is too long').optional(),
  base_currency: z.string().length(3),
});

export type GroupFormValues = z.infer<typeof groupSchema>;

const CURRENCIES = [
  { label: 'AUD – Australian Dollar', value: 'AUD' },
  { label: 'USD – US Dollar',         value: 'USD' },
  { label: 'EUR – Euro',              value: 'EUR' },
  { label: 'GBP – British Pound',     value: 'GBP' },
  { label: 'CAD – Canadian Dollar',   value: 'CAD' },
  { label: 'SGD – Singapore Dollar',  value: 'SGD' },
  { label: 'HKD – Hong Kong Dollar',  value: 'HKD' },
];

interface GroupFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: GroupFormValues) => Promise<void>;
  defaultValues?: Partial<PortfolioGroup>;
  mode?: 'create' | 'edit';
}

export function GroupForm({ open, onClose, onSubmit, defaultValues, mode = 'create' }: GroupFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name:          defaultValues?.name          || '',
      description:   defaultValues?.description   || '',
      base_currency: defaultValues?.base_currency || 'AUD',
    },
  });

  const baseCurrency = watch('base_currency');
  const handleClose = () => { reset(); onClose(); };

  const handleFormSubmit = async (values: GroupFormValues) => {
    await onSubmit(values);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'create' ? 'New Group' : 'Edit Group'}
      size="sm"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input
          label="Group Name"
          placeholder="e.g., Moomoo, CBA Invest"
          error={errors.name?.message}
          required
          {...register('name')}
        />

        <Select
          label="Base Currency"
          options={CURRENCIES}
          value={baseCurrency}
          onChange={(v) => setValue('base_currency', v)}
          error={errors.base_currency?.message}
          required
        />

        <Textarea
          label="Description"
          placeholder="Optional — e.g., Moomoo AUD + US accounts"
          error={errors.description?.message}
          {...register('description')}
        />

        <p className="text-[13px] text-[var(--c-ink-mute)]">
          The base currency is used for consolidated performance and tax reports.
          All portfolio values are converted to this currency for group-level totals.
        </p>

        <ModalActions>
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {mode === 'create' ? 'Create Group' : 'Save Changes'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
