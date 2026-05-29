import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageLoader } from '../ui/LoadingSpinner';

interface ApprovedGuardProps {
  children: ReactNode;
}

export function ApprovedGuard({ children }: ApprovedGuardProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <PageLoader label="Loading profile..." />;
  }

  if (!profile) {
    return <PageLoader label="Setting up your account..." />;
  }

  if (profile.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (profile.status === 'rejected') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
