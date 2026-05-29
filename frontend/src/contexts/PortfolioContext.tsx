import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Portfolio } from '../types';

interface PortfolioContextValue {
  activePortfolio: Portfolio | null;
  setActivePortfolio: (portfolio: Portfolio | null) => void;
  portfolios: Portfolio[];
  setPortfolios: (portfolios: Portfolio[]) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const STORAGE_KEY = 'folio_active_portfolio_id';

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [activePortfolio, setActivePortfolioState] = useState<Portfolio | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  // Restore active portfolio from localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId && portfolios.length > 0) {
      const found = portfolios.find((p) => p.id === savedId);
      if (found) setActivePortfolioState(found);
    }
  }, [portfolios]);

  const setActivePortfolio = (portfolio: Portfolio | null) => {
    setActivePortfolioState(portfolio);
    if (portfolio) {
      localStorage.setItem(STORAGE_KEY, portfolio.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <PortfolioContext.Provider
      value={{ activePortfolio, setActivePortfolio, portfolios, setPortfolios }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolioContext(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolioContext must be used within PortfolioProvider');
  return ctx;
}
