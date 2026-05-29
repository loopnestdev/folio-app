import { useParams, Navigate } from 'react-router-dom';

// Portfolio detail redirects to holdings by default
export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/portfolios" replace />;
  return <Navigate to={`/portfolios/${id}/holdings`} replace />;
}
