import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Textarea } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import type { Portfolio } from '../../types';

const portfolioSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().max(500, 'Description is too long').optional(),
  currency: z.string().min(1, 'Currency is required'),
});

type PortfolioFormValues = z.infer<typeof portfolioSchema>;

const CURRENCIES = [
  { label: 'USD – US Dollar', value: 'USD' },
  { label: 'AUD – Australian Dollar', value: 'AUD' },
  { label: 'EUR – Euro', value: 'EUR' },
  { label: 'GBP – British Pound', value: 'GBP' },
  { label: 'CAD – Canadian Dollar', value: 'CAD' },
  { label: 'JPY – Japanese Yen', value: 'JPY' },
  { label: 'SGD – Singapore Dollar', value: 'SGD' },
  { label: 'HKD – Hong Kong Dollar', value: 'HKD' },
];

interface PortfolioFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PortfolioFormValues) => Promise<void>;
  defaultValues?: Partial<Portfolio>;
  mode?: 'create' | 'edit';
}

export function PortfolioForm({ open, onClose, onSubmit, defaultValues, mode = 'create' }: PortfolioFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioFormValues>({
    resolver: zodResolver(portfolioSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      description: defaultValues?.description || '',
      currency: defaultValues?.currency || 'USD',
    },
  });

  const currency = watch('currency');

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFormSubmit = async (values: PortfolioFormValues) => {
    await onSubmit(values);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'create' ? 'Create Portfolio' : 'Edit Portfolio'}
      size="md"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Input
          label="Portfolio Name"
          placeholder="e.g., Personal Investments"
          error={errors.name?.message}
          required
          {...register('name')}
        />

        <Select
          label="Currency"
          options={CURRENCIES}
          value={currency}
          onChange={(v) => setValue('currency', v)}
          error={errors.currency?.message}
          required
        />

        <Textarea
          label="Description"
          placeholder="Optional description for this portfolio"
          error={errors.description?.message}
          {...register('description')}
        />

        <ModalActions>
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {mode === 'create' ? 'Create Portfolio' : 'Save Changes'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

export type { PortfolioFormValues };
