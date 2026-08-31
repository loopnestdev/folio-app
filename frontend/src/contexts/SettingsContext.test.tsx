import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { AuthProvider } from './AuthContext';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

// Mock api
vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: null }),
    patch: vi.fn().mockResolvedValue({ data: null }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

function TestComponent() {
  const { chartLibrary, setChartLibrary, financialYear, setFinancialYear } = useSettings();
  return (
    <div>
      <span data-testid="chart-library">{chartLibrary}</span>
      <span data-testid="financial-year">{financialYear}</span>
      <button
        data-testid="set-echarts"
        onClick={() => setChartLibrary('echarts')}
      >
        Set ECharts
      </button>
      <button
        data-testid="set-recharts"
        onClick={() => setChartLibrary('recharts')}
      >
        Set Recharts
      </button>
      <button
        data-testid="set-jul-jun"
        onClick={() => setFinancialYear('jul-jun')}
      >
        Set Jul-Jun
      </button>
      <button
        data-testid="set-jan-dec"
        onClick={() => setFinancialYear('jan-dec')}
      >
        Set Jan-Dec
      </button>
    </div>
  );
}

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </AuthProvider>
  );
}

describe('SettingsContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides default recharts library', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chart-library').textContent).toBe('recharts');
    });
  });

  it('switches chart library to echarts', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-echarts'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-library').textContent).toBe('echarts');
    });
  });

  it('switches chart library back to recharts', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-echarts'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('set-recharts'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-library').textContent).toBe('recharts');
    });
  });

  it('persists chart library to localStorage', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-echarts'));
    });

    expect(localStorage.getItem('folio_chart_library')).toBe('echarts');
  });

  it('provides default jul-jun financial year', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('financial-year').textContent).toBe('jul-jun');
    });
  });

  it('switches financial year to jul-jun', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-jul-jun'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('financial-year').textContent).toBe('jul-jun');
    });
  });

  it('persists financial year to localStorage', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('set-jul-jun'));
    });

    expect(localStorage.getItem('folio_financial_year')).toBe('jul-jun');
  });

  it('restores settings from localStorage', async () => {
    localStorage.setItem('folio_chart_library', 'echarts');
    localStorage.setItem('folio_financial_year', 'jul-jun');

    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('chart-library').textContent).toBe('echarts');
      expect(screen.getByTestId('financial-year').textContent).toBe('jul-jun');
    });
  });

  it('throws when used outside SettingsProvider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow('useSettings must be used within SettingsProvider');
    spy.mockRestore();
  });
});
