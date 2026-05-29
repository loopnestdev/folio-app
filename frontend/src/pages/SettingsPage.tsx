import type { ReactNode } from 'react';
import { BarChart3, Calendar, User } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';
import type { ChartLibrary, FinancialYearType } from '../types';
import { cn } from '../lib/utils';

interface ToggleOptionProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToggleOption({ selected, onClick, children }: ToggleOptionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3 px-4 rounded-xl text-[15px] font-medium transition-all border',
        selected
          ? 'bg-[#0066cc] text-white border-[#0066cc]'
          : 'bg-white text-[#1d1d1f] border-[#e0e0e0] hover:border-[#0066cc]/40',
      )}
    >
      {children}
    </button>
  );
}

export function SettingsPage() {
  const { chartLibrary, setChartLibrary, financialYear, setFinancialYear } = useSettings();
  const { profile } = useAuth();
  const toast = useToast();

  const handleChartLibraryChange = async (lib: ChartLibrary) => {
    await setChartLibrary(lib);
    toast.success('Chart library updated', `Now using ${lib === 'recharts' ? 'Recharts' : 'Apache ECharts'}.`);
  };

  const handleFinancialYearChange = async (fy: FinancialYearType) => {
    await setFinancialYear(fy);
    toast.success('Financial year updated');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#1d1d1f]">Settings</h1>
        <p className="text-[15px] text-[#7a7a7a] mt-1">Customize your Folio experience</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader
          title="Profile"
          subtitle="Your account information"
        />
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || 'Avatar'}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#0066cc] flex items-center justify-center">
                <User size={24} className="text-white" />
              </div>
            )}
            <div>
              <p className="text-[17px] font-semibold text-[#1d1d1f]">
                {profile?.full_name || 'Unknown'}
              </p>
              <p className="text-[15px] text-[#7a7a7a]">{profile?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#e0e0e0]">
            <div>
              <p className="text-[13px] text-[#7a7a7a] mb-1">Role</p>
              <p className="text-[15px] font-medium text-[#1d1d1f] capitalize">{profile?.role || '—'}</p>
            </div>
            <div>
              <p className="text-[13px] text-[#7a7a7a] mb-1">Status</p>
              <p className="text-[15px] font-medium text-[#1d1d1f] capitalize">{profile?.status || '—'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Chart Library */}
      <Card>
        <CardHeader
          title="Chart Library"
          subtitle="Choose the charting library used to render all charts. Changes apply immediately."
        />
        <div className="space-y-3">
          <div className="flex gap-3">
            <ToggleOption
              selected={chartLibrary === 'recharts'}
              onClick={() => handleChartLibraryChange('recharts')}
            >
              <div className="flex items-center justify-center gap-2">
                <BarChart3 size={18} />
                <span>Recharts</span>
              </div>
              {chartLibrary === 'recharts' && (
                <div className="text-[12px] mt-1 opacity-80">Currently active</div>
              )}
            </ToggleOption>
            <ToggleOption
              selected={chartLibrary === 'echarts'}
              onClick={() => handleChartLibraryChange('echarts')}
            >
              <div className="flex items-center justify-center gap-2">
                <BarChart3 size={18} />
                <span>Apache ECharts</span>
              </div>
              {chartLibrary === 'echarts' && (
                <div className="text-[12px] mt-1 opacity-80">Currently active</div>
              )}
            </ToggleOption>
          </div>
          <p className="text-[13px] text-[#7a7a7a]">
            Recharts is the default. Apache ECharts offers more customization and better performance with large datasets.
            Your preference is saved to your profile.
          </p>
        </div>
      </Card>

      {/* Financial Year */}
      <Card>
        <CardHeader
          title="Financial Year"
          subtitle="Set the financial year period used for tax reports and annual calculations."
        />
        <div className="space-y-3">
          <div className="flex gap-3">
            <ToggleOption
              selected={financialYear === 'jan-dec'}
              onClick={() => handleFinancialYearChange('jan-dec')}
            >
              <div className="flex items-center justify-center gap-2">
                <Calendar size={18} />
                <span>Jan – Dec</span>
              </div>
            </ToggleOption>
            <ToggleOption
              selected={financialYear === 'jul-jun'}
              onClick={() => handleFinancialYearChange('jul-jun')}
            >
              <div className="flex items-center justify-center gap-2">
                <Calendar size={18} />
                <span>Jul – Jun (Australian)</span>
              </div>
            </ToggleOption>
          </div>
          <p className="text-[13px] text-[#7a7a7a]">
            The July–June financial year is used in Australia. This affects the Tax Report and related calculations.
          </p>
        </div>
      </Card>

      {/* App info */}
      <div className="text-center py-4 space-y-1">
        <p className="text-[13px] text-[#7a7a7a]">Folio — Portfolio Tracker</p>
        <p className="text-[13px] text-[#7a7a7a]">Version 1.0.0</p>
      </div>
    </div>
  );
}
