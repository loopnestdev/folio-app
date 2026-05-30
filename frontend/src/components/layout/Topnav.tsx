import { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, Settings, User, ChevronDown, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PortfolioSelector } from './PortfolioSelector';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';

interface TopnavProps {
  onMenuClick: () => void;
}

export function Topnav({ onMenuClick }: TopnavProps) {
  const { profile, user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="h-11 bg-[var(--c-canvas)] border-b border-[var(--c-border)] flex items-center px-4 gap-4 shrink-0 z-30">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--c-ink)] font-semibold text-[17px] tracking-tight">Folio</span>
      </div>

      {/* Portfolio selector */}
      <div className="hidden sm:flex items-center ml-2">
        <PortfolioSelector />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dark mode toggle */}
      <button
        onClick={toggle}
        className="p-1.5 rounded-lg text-[var(--c-ink-mute)] hover:text-[var(--c-ink)] hover:bg-[var(--c-canvas-soft)] transition-colors"
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* User menu */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex items-center gap-2 text-[var(--c-ink)] hover:text-[var(--c-ink-sec)] transition-colors"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--c-primary)] flex items-center justify-center text-[12px] font-semibold text-white">
              {initials}
            </div>
          )}
          <span className="hidden md:block text-[15px] font-medium max-w-[120px] truncate">
            {displayName}
          </span>
          <ChevronDown size={14} className={cn('transition-transform', userMenuOpen && 'rotate-180')} />
        </button>

        {userMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-[14px] shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-[var(--c-border)]">
              <p className="text-[15px] font-semibold text-[var(--c-ink)] truncate">{displayName}</p>
              <p className="text-[13px] text-[var(--c-ink-mute)] truncate">{user?.email}</p>
            </div>
            <div className="py-1">
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-[var(--c-ink)] hover:bg-[var(--c-canvas-soft)]"
              >
                <Settings size={16} className="text-[var(--c-ink-mute)]" />
                Settings
              </button>
              {profile?.role === 'admin' && (
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/admin'); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-[var(--c-ink)] hover:bg-[var(--c-canvas-soft)]"
                >
                  <User size={16} className="text-[var(--c-ink-mute)]" />
                  Admin Panel
                </button>
              )}
            </div>
            <div className="border-t border-[var(--c-border)]">
              <button
                onClick={() => { setUserMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-[var(--c-bear)] hover:bg-[var(--c-bear-bg)]"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
