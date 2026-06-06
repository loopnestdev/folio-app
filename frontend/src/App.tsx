import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { PortfolioProvider } from './contexts/PortfolioContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { AuthGuard } from './components/guards/AuthGuard';
import { ApprovedGuard } from './components/guards/ApprovedGuard';
import { AdminGuard } from './components/guards/AdminGuard';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PendingPage } from './pages/PendingPage';
import { DashboardPage } from './pages/DashboardPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { PortfolioDetailPage } from './pages/PortfolioDetailPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { TradesPage } from './pages/TradesPage';
import { ImportPage } from './pages/ImportPage';
import { PerformancePage } from './pages/reports/PerformancePage';
import { MonthlyProfitPage } from './pages/reports/MonthlyProfitPage';
import { StatisticsPage } from './pages/reports/StatisticsPage';
import { TaxPage } from './pages/reports/TaxPage';
import { DividendsPage } from './pages/reports/DividendsPage';
import { CapitalGainsPage } from './pages/reports/CapitalGainsPage';
import { CashFlowPage } from './pages/reports/CashFlowPage';
import { DiversityPage } from './pages/reports/DiversityPage';
import { DrawdownPage } from './pages/reports/DrawdownPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { GroupDashboardPage } from './pages/groups/GroupDashboardPage';
import { GroupCapitalGainsPage } from './pages/groups/GroupCapitalGainsPage';
import { GroupTaxPage } from './pages/groups/GroupTaxPage';
import { GroupMonthlyProfitPage } from './pages/groups/GroupMonthlyProfitPage';
import { TargetPortfoliosPage } from './pages/targets/TargetPortfoliosPage';
import { TargetPortfolioDetailPage } from './pages/targets/TargetPortfolioDetailPage';
import { RebalancePage } from './pages/targets/RebalancePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function ProtectedRoutes() {
  return (
    <AuthGuard>
      <ApprovedGuard>
        <SettingsProvider>
          <PortfolioProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="portfolios" element={<PortfoliosPage />} />
                <Route path="portfolios/:id" element={<PortfolioDetailPage />} />
                <Route path="portfolios/:id/holdings" element={<HoldingsPage />} />
                <Route path="portfolios/:id/trades" element={<TradesPage />} />
                <Route path="portfolios/:id/import" element={<ImportPage />} />
                <Route path="portfolios/:id/reports/performance" element={<PerformancePage />} />
                <Route path="portfolios/:id/reports/monthly-profit" element={<MonthlyProfitPage />} />
                <Route path="portfolios/:id/reports/statistics" element={<StatisticsPage />} />
                <Route path="portfolios/:id/reports/tax" element={<TaxPage />} />
                <Route path="portfolios/:id/reports/dividends" element={<DividendsPage />} />
                <Route path="portfolios/:id/reports/capital-gains" element={<CapitalGainsPage />} />
                <Route path="portfolios/:id/reports/cash-flows" element={<CashFlowPage />} />
                <Route path="portfolios/:id/reports/diversity" element={<DiversityPage />} />
                <Route path="portfolios/:id/reports/drawdown" element={<DrawdownPage />} />
                <Route path="groups/:id" element={<GroupDashboardPage />} />
                <Route path="groups/:id/monthly-profit" element={<GroupMonthlyProfitPage />} />
                <Route path="groups/:id/capital-gains" element={<GroupCapitalGainsPage />} />
                <Route path="groups/:id/tax" element={<GroupTaxPage />} />
                <Route path="target-portfolios" element={<TargetPortfoliosPage />} />
                <Route path="target-portfolios/:id" element={<TargetPortfolioDetailPage />} />
                <Route path="target-portfolios/:id/rebalance" element={<RebalancePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route
                  path="admin"
                  element={
                    <AdminGuard>
                      <AdminPage />
                    </AdminGuard>
                  }
                />
              </Route>
            </Routes>
          </PortfolioProvider>
        </SettingsProvider>
      </ApprovedGuard>
    </AuthGuard>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/pending" element={<PendingPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              {/* Protected routes */}
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
