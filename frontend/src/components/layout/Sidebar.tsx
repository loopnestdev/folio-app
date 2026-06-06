import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  BarChart3,
  TrendingUp,
  FileText,
  Receipt,
  PieChart,
  List,
  Upload,
  LineChart,
  Calendar,
  DollarSign,
  Wallet,
  Settings,
  Shield,
  X,
  Package,
  Layers,
  Target,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortfolioContext } from '../../contexts/PortfolioContext';
import { useGroups } from '../../hooks/useGroups';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  requiresPortfolio?: boolean;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-xl text-[15px] transition-colors',
          isActive
            ? 'bg-[var(--c-primary-bg)] text-[var(--c-primary)] font-semibold'
            : 'text-[var(--c-ink)] hover:bg-[var(--c-canvas-soft)] font-medium',
        )
      }
    >
      <span className="shrink-0">{item.icon}</span>
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile } = useAuth();
  const { activePortfolio } = usePortfolioContext();
  const { id: paramId } = useParams<{ id: string }>();
  const portfolioId = activePortfolio?.id || paramId;
  const { data: groups = [] } = useGroups();

  const mainItems: NavItem[] = [
    { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={18} /> },
    { label: 'Portfolios', to: '/portfolios', icon: <Briefcase size={18} /> },
    { label: 'Target Portfolios', to: '/target-portfolios', icon: <Target size={18} /> },
  ];

  const portfolioItems: NavItem[] = portfolioId
    ? [
        {
          label: 'Holdings',
          to: `/portfolios/${portfolioId}/holdings`,
          icon: <Package size={18} />,
          requiresPortfolio: true,
        },
        {
          label: 'Trades',
          to: `/portfolios/${portfolioId}/trades`,
          icon: <List size={18} />,
          requiresPortfolio: true,
        },
        {
          label: 'Import',
          to: `/portfolios/${portfolioId}/import`,
          icon: <Upload size={18} />,
          requiresPortfolio: true,
        },
      ]
    : [];

  const reportItems: NavItem[] = portfolioId
    ? [
        {
          label: 'Performance',
          to: `/portfolios/${portfolioId}/reports/performance`,
          icon: <TrendingUp size={18} />,
        },
        {
          label: 'Monthly Profit',
          to: `/portfolios/${portfolioId}/reports/monthly-profit`,
          icon: <BarChart3 size={18} />,
        },
        {
          label: 'Statistics',
          to: `/portfolios/${portfolioId}/reports/statistics`,
          icon: <LineChart size={18} />,
        },
        {
          label: 'Tax',
          to: `/portfolios/${portfolioId}/reports/tax`,
          icon: <Receipt size={18} />,
        },
        {
          label: 'Dividends',
          to: `/portfolios/${portfolioId}/reports/dividends`,
          icon: <DollarSign size={18} />,
        },
        {
          label: 'Capital Gains',
          to: `/portfolios/${portfolioId}/reports/capital-gains`,
          icon: <FileText size={18} />,
        },
        {
          label: 'Cash Flow',
          to: `/portfolios/${portfolioId}/reports/cash-flows`,
          icon: <Wallet size={18} />,
        },
        {
          label: 'Diversity',
          to: `/portfolios/${portfolioId}/reports/diversity`,
          icon: <PieChart size={18} />,
        },
        {
          label: 'Drawdown',
          to: `/portfolios/${portfolioId}/reports/drawdown`,
          icon: <Calendar size={18} />,
        },
      ]
    : [];

  const bottomItems: NavItem[] = [
    { label: 'Settings', to: '/settings', icon: <Settings size={18} /> },
    ...(profile?.role === 'admin'
      ? [{ label: 'Admin', to: '/admin', icon: <Shield size={18} /> }]
      : []),
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--c-canvas)] border-r border-[var(--c-border)]">
      {/* Mobile close button */}
      <div className="flex items-center justify-between px-4 py-3 lg:hidden border-b border-[var(--c-border)]">
        <span className="font-semibold text-[17px] text-[var(--c-ink)]">Navigation</span>
        <button
          onClick={onClose}
          className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Main items */}
        {mainItems.map((item) => (
          <NavItemLink key={item.to} item={item} onClick={onClose} />
        ))}

        {/* Groups */}
        {groups.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-widest">
                Groups
              </p>
            </div>
            {groups.map((g) => (
              <NavLink
                key={g.id}
                to={`/groups/${g.id}`}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-xl text-[15px] transition-colors',
                    isActive
                      ? 'bg-[var(--c-primary-bg)] text-[var(--c-primary)] font-semibold'
                      : 'text-[var(--c-ink)] hover:bg-[var(--c-canvas-soft)] font-medium',
                  )
                }
              >
                <Layers size={18} className="shrink-0" />
                <span className="truncate">{g.name}</span>
              </NavLink>
            ))}
          </>
        )}

        {/* Portfolio-specific items */}
        {portfolioItems.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-widest">
                Portfolio
              </p>
            </div>
            {portfolioItems.map((item) => (
              <NavItemLink key={item.to} item={item} onClick={onClose} />
            ))}
          </>
        )}

        {/* Reports */}
        {reportItems.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[11px] font-semibold text-[var(--c-ink-mute)] uppercase tracking-widest">
                Reports
              </p>
            </div>
            {reportItems.map((item) => (
              <NavItemLink key={item.to} item={item} onClick={onClose} />
            ))}
          </>
        )}

        {!portfolioId && (
          <div className="mt-4 mx-2 p-3 bg-[var(--c-canvas-soft)] rounded-xl text-[13px] text-[var(--c-ink-mute)]">
            Select a portfolio to see reports and details
          </div>
        )}
      </nav>

      {/* Bottom items */}
      <div className="p-3 border-t border-[var(--c-border)] space-y-1">
        {bottomItems.map((item) => (
          <NavItemLink key={item.to} item={item} onClick={onClose} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col h-full">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative w-72 h-full overflow-hidden shadow-xl z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
