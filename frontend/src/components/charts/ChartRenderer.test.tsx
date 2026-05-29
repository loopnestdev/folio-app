import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChartRenderer, useChartLibrary } from './ChartRenderer';
import { SettingsProvider, useSettings } from '../../contexts/SettingsContext';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

// Mock api
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: null }),
    patch: vi.fn().mockResolvedValue({ data: null }),
  },
}));

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </AuthProvider>
  );
}

function TestChart() {
  const library = useChartLibrary();
  return (
    <div data-testid="test-chart">
      <span data-testid="chart-library-display">{library}</span>
    </div>
  );
}

function TestSwitcher() {
  const { setChartLibrary } = useSettings();
  return (
    <div>
      <TestChart />
      <button data-testid="switch-echarts" onClick={() => setChartLibrary('echarts')}>
        Switch to ECharts
      </button>
      <button data-testid="switch-recharts" onClick={() => setChartLibrary('recharts')}>
        Switch to Recharts
      </button>
    </div>
  );
}

describe('ChartRenderer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders children', () => {
    render(
      <TestWrapper>
        <ChartRenderer label="test-chart">
          <div data-testid="child">Chart content</div>
        </ChartRenderer>
      </TestWrapper>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('exposes data-chart-library attribute', async () => {
    render(
      <TestWrapper>
        <ChartRenderer label="performance">
          <div>Content</div>
        </ChartRenderer>
      </TestWrapper>,
    );
    await waitFor(() => {
      const wrapper = document.querySelector('[data-chart-library]');
      expect(wrapper).toHaveAttribute('data-chart-library', 'recharts');
    });
  });

  it('updates data-chart-library attribute when switched to echarts', async () => {
    render(
      <TestWrapper>
        <TestSwitcher />
        <ChartRenderer label="performance">
          <div>Content</div>
        </ChartRenderer>
      </TestWrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-echarts'));
    });

    await waitFor(() => {
      const wrapper = document.querySelector('[data-chart-library]');
      expect(wrapper).toHaveAttribute('data-chart-library', 'echarts');
    });
  });

  it('useChartLibrary hook defaults to recharts', async () => {
    render(
      <TestWrapper>
        <TestChart />
      </TestWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chart-library-display').textContent).toBe('recharts');
    });
  });

  it('useChartLibrary hook updates when settings change', async () => {
    render(
      <TestWrapper>
        <TestSwitcher />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('chart-library-display').textContent).toBe('recharts');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-echarts'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-library-display').textContent).toBe('echarts');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-recharts'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('chart-library-display').textContent).toBe('recharts');
    });
  });

  it('sets data-chart-label attribute', async () => {
    render(
      <TestWrapper>
        <ChartRenderer label="my-performance-chart">
          <div>Content</div>
        </ChartRenderer>
      </TestWrapper>,
    );
    await waitFor(() => {
      const wrapper = document.querySelector('[data-chart-label]');
      expect(wrapper).toHaveAttribute('data-chart-label', 'my-performance-chart');
    });
  });
});
