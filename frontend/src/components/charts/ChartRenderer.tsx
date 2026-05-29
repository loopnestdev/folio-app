import type { ReactNode } from 'react';
import { useSettings } from '../../contexts/SettingsContext';

// ChartRenderer is a thin wrapper that reads the chartLibrary from SettingsContext
// and passes it down. Individual chart components handle their own library switching.
// This component is useful for debugging or wrapping charts with a unified API.

interface ChartRendererProps {
  children: ReactNode;
  label?: string;
}

export function ChartRenderer({ children, label }: ChartRendererProps) {
  const { chartLibrary } = useSettings();

  return (
    <div data-chart-library={chartLibrary} data-chart-label={label}>
      {children}
    </div>
  );
}

// Export the current chart library for testing
export function useChartLibrary() {
  const { chartLibrary } = useSettings();
  return chartLibrary;
}
