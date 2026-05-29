import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Modal, ModalActions } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToast } from '../components/ui/Toast';
import { formatDate } from '../lib/utils';
import type { UserProfile, UserRole, UserStatus } from '../types';

export function AdminPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [confirmAction, setConfirmAction] = useState<{
    user: UserProfile;
    action: 'approve' | 'reject';
  } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get<UserProfile[]>('/api/admin/users');
      return data;
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ userId, status, role }: { userId: string; status?: UserStatus; role?: UserRole }) => {
      const { data } = await api.patch<UserProfile>(`/api/admin/users/${userId}`, { status, role });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const handleApprove = async () => {
    if (!confirmAction) return;
    try {
      await updateUser.mutateAsync({ userId: confirmAction.user.id, status: 'approved' });
      toast.success('User approved', `${confirmAction.user.full_name || confirmAction.user.email} can now log in.`);
    } catch {
      toast.error('Failed to approve user');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleReject = async () => {
    if (!confirmAction) return;
    try {
      await updateUser.mutateAsync({ userId: confirmAction.user.id, status: 'rejected' });
      toast.warning('User rejected');
    } catch {
      toast.error('Failed to reject user');
    } finally {
      setConfirmAction(null);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      await updateUser.mutateAsync({ userId, role });
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  const columns = [
    {
      key: 'full_name',
      label: 'Name',
      sortable: true,
      render: (v: unknown, row: UserProfile) => (
        <div>
          <div className="font-medium text-[#1d1d1f]">{String(v || '—')}</div>
          <div className="text-[13px] text-[#7a7a7a]">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v: unknown) => <StatusBadge status={String(v)} />,
    },
    {
      key: 'role',
      label: 'Role',
      render: (v: unknown, row: UserProfile) => (
        <Select
          options={[
            { label: 'Standard', value: 'standard' },
            { label: 'Admin', value: 'admin' },
          ]}
          value={String(v)}
          onChange={(newRole) => handleRoleChange(row.id, newRole as UserRole)}
          containerClassName="w-32"
        />
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      sortable: true,
      render: (v: unknown) => formatDate(String(v)),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_v: unknown, row: UserProfile) =>
        row.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmAction({ user: row, action: 'approve' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#34c759]/10 text-[#1a7a2e] rounded-full text-[13px] font-medium hover:bg-[#34c759]/20 transition-colors"
            >
              <CheckCircle size={14} /> Approve
            </button>
            <button
              onClick={() => setConfirmAction({ user: row, action: 'reject' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ff3b30]/10 text-[#c0302a] rounded-full text-[13px] font-medium hover:bg-[#ff3b30]/20 transition-colors"
            >
              <XCircle size={14} /> Reject
            </button>
          </div>
        ) : (
          <span className="text-[13px] text-[#7a7a7a]">—</span>
        ),
    },
  ];

  const pendingCount = users.filter((u) => u.status === 'pending').length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#0066cc]/10 rounded-xl flex items-center justify-center">
          <Shield size={20} className="text-[#0066cc]" />
        </div>
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Admin Panel</h1>
          <p className="text-[15px] text-[#7a7a7a] mt-0.5">
            Manage users and permissions
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-[#ff9500] text-white text-[11px] font-bold rounded-full">
                {pendingCount}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-[18px] border border-[#e0e0e0] p-5">
          <p className="text-[13px] text-[#7a7a7a] font-semibold uppercase tracking-wide mb-1">Total Users</p>
          <p className="text-[28px] font-semibold text-[#1d1d1f]">{users.length}</p>
        </div>
        <div className="bg-white rounded-[18px] border border-[#e0e0e0] p-5">
          <p className="text-[13px] text-[#7a7a7a] font-semibold uppercase tracking-wide mb-1">Pending Approval</p>
          <p className="text-[28px] font-semibold text-[#ff9500]">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-[18px] border border-[#e0e0e0] p-5">
          <p className="text-[13px] text-[#7a7a7a] font-semibold uppercase tracking-wide mb-1">Active Users</p>
          <p className="text-[28px] font-semibold text-[#34c759]">{users.filter((u) => u.status === 'approved').length}</p>
        </div>
      </div>

      {/* Users table */}
      <Card padding="none">
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-[19px] font-semibold text-[#1d1d1f]">All Users</h2>
        </div>
        <Table<UserProfile>
          columns={columns as Parameters<typeof Table<UserProfile>>[0]['columns']}
          data={users}
          keyField="id"
          emptyMessage="No users found"
        />
      </Card>

      {/* Confirmation modal */}
      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.action === 'approve' ? 'Approve User' : 'Reject User'}
        size="sm"
      >
        <p className="text-[15px] text-[#1d1d1f]">
          {confirmAction?.action === 'approve'
            ? `Allow ${confirmAction.user.full_name || confirmAction.user.email} to access the application?`
            : `Reject access for ${confirmAction?.user.full_name || confirmAction?.user.email}? They will not be able to log in.`}
        </p>
        <ModalActions>
          <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
          {confirmAction?.action === 'approve' ? (
            <Button
              variant="primary"
              onClick={handleApprove}
              loading={updateUser.isPending}
              icon={<CheckCircle size={16} />}
            >
              Approve Access
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={handleReject}
              loading={updateUser.isPending}
            >
              Reject
            </Button>
          )}
        </ModalActions>
      </Modal>
    </div>
  );
}
