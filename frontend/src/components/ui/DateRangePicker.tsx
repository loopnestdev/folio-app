import { useState } from 'react';
import { cn } from '../../lib/utils';
import type { DateRange } from '../../types';

interface DateRangePickerProps {
  value: DateRange;
  customStart?: string;
  customEnd?: string;
  onChange: (range: DateRange, customStart?: string, customEnd?: string) => void;
  className?: string;
}

const PRESETS: { label: string; value: DateRange }[] = [
  { label: 'YTD', value: 'YTD' },
  { label: '1Y', value: '1Y' },
  { label: '2Y', value: '2Y' },
  { label: '3Y', value: '3Y' },
  { label: '5Y', value: '5Y' },
  { label: 'All', value: 'ALL' },
  { label: 'Custom', value: 'CUSTOM' },
];

export function DateRangePicker({ value, customStart, customEnd, onChange, className }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(value === 'CUSTOM');
  const [localStart, setLocalStart] = useState(customStart || '');
  const [localEnd, setLocalEnd] = useState(customEnd || '');

  const handlePresetClick = (preset: DateRange) => {
    if (preset === 'CUSTOM') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onChange(preset);
    }
  };

  const handleCustomApply = () => {
    if (localStart && localEnd) {
      onChange('CUSTOM', localStart, localEnd);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center bg-[var(--c-canvas-soft)] rounded-full p-1 gap-0.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetClick(preset.value)}
            className={cn(
              'px-3 py-1 rounded-full text-[13px] font-medium transition-colors',
              (value === preset.value || (preset.value === 'CUSTOM' && showCustom))
                ? 'bg-[var(--c-canvas)] text-[var(--c-primary)] shadow-sm'
                : 'text-[var(--c-ink-mute)] hover:text-[var(--c-ink)]',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <input
            type="date"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
            className="border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[14px] text-[var(--c-ink)] bg-[var(--c-canvas)] focus:outline-none focus:border-[var(--c-primary)]"
          />
          <span className="text-[var(--c-ink-mute)] text-[13px]">to</span>
          <input
            type="date"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
            className="border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[14px] text-[var(--c-ink)] bg-[var(--c-canvas)] focus:outline-none focus:border-[var(--c-primary)]"
          />
          <button
            onClick={handleCustomApply}
            disabled={!localStart || !localEnd}
            className="px-4 py-1.5 bg-[var(--c-primary)] text-white rounded-full text-[13px] font-semibold disabled:opacity-50 hover:bg-[var(--c-primary-deep)] transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
