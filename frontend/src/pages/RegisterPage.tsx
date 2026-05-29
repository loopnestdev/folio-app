import { Navigate } from 'react-router-dom';

// Registration is handled through Google OAuth (same as login).
// This page simply redirects to login.
export function RegisterPage() {
  return <Navigate to="/login" replace />;
}
