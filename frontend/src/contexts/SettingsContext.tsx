import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { ChartLibrary, FinancialYearType } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

interface SettingsContextValue {
  chartLibrary: ChartLibrary;
  setChartLibrary: (library: ChartLibrary) => Promise<void>;
  financialYear: FinancialYearType;
  setFinancialYear: (fy: FinancialYearType) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY_CHART = 'folio_chart_library';
const STORAGE_KEY_FY = 'folio_financial_year';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  const [chartLibrary, setChartLibraryState] = useState<ChartLibrary>(
    () => (localStorage.getItem(STORAGE_KEY_CHART) as ChartLibrary) || 'recharts',
  );

  const [financialYear, setFinancialYearState] = useState<FinancialYearType>(
    () => (localStorage.getItem(STORAGE_KEY_FY) as FinancialYearType) || 'jan-dec',
  );

  // Sync from profile when it loads
  useEffect(() => {
    if (profile) {
      if (profile.chart_library) {
        setChartLibraryState(profile.chart_library);
        localStorage.setItem(STORAGE_KEY_CHART, profile.chart_library);
      }
      if (profile.financial_year) {
        setFinancialYearState(profile.financial_year);
        localStorage.setItem(STORAGE_KEY_FY, profile.financial_year);
      }
    }
  }, [profile]);

  const setChartLibrary = async (library: ChartLibrary) => {
    setChartLibraryState(library);
    localStorage.setItem(STORAGE_KEY_CHART, library);
    try {
      await api.patch('/api/auth/profile', { chart_library: library });
    } catch (err) {
      console.error('Failed to persist chart library preference:', err);
    }
  };

  const setFinancialYear = async (fy: FinancialYearType) => {
    setFinancialYearState(fy);
    localStorage.setItem(STORAGE_KEY_FY, fy);
    try {
      await api.patch('/api/auth/profile', { financial_year: fy });
    } catch (err) {
      console.error('Failed to persist financial year preference:', err);
    }
  };

  return (
    <SettingsContext.Provider value={{ chartLibrary, setChartLibrary, financialYear, setFinancialYear }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
