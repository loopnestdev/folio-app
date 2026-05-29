import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageLoader } from '../ui/LoadingSpinner';

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <PageLoader label="Checking permissions..." />;
  }

  if (!profile || profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
