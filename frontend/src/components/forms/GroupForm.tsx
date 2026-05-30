import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Textarea } from '../ui/Input';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import type { PortfolioGroup } from '../../types';

const groupSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().max(500, 'Description is too long').optional(),
});

export type GroupFormValues = z.infer<typeof groupSchema>;

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
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name:        defaultValues?.name || '',
      description: defaultValues?.description || '',
    },
  });

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

        <Textarea
          label="Description"
          placeholder="Optional — e.g., Moomoo AUD + US accounts"
          error={errors.description?.message}
          {...register('description')}
        />

        <p className="text-[13px] text-[var(--c-ink-mute)]">
          A group bundles related portfolios so you can view consolidated performance and tax across all of them.
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
