import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';

export function PendingPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Auto-poll every 30 seconds to check if approved
  useEffect(() => {
    const interval = setInterval(async () => {
      await refreshProfile();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refreshProfile]);

  // Redirect if approved
  useEffect(() => {
    if (profile?.status === 'approved') {
      navigate('/', { replace: true });
    }
  }, [profile?.status, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[var(--c-canvas-soft)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-[var(--c-warn-bg)] rounded-full mb-6">
          <Clock size={36} className="text-[var(--c-warn)]" />
        </div>

        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--c-ink)] mb-3">
          Awaiting Approval
        </h1>

        <p className="text-[17px] text-[var(--c-ink-mute)] leading-relaxed mb-2">
          Your account has been created and is pending review by an administrator.
        </p>

        {profile?.email && (
          <div className="inline-flex items-center gap-2 bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-full px-4 py-2 my-4">
            <Mail size={16} className="text-[var(--c-ink-mute)]" />
            <span className="text-[15px] text-[var(--c-ink)] font-medium">{profile.email}</span>
          </div>
        )}

        <p className="text-[15px] text-[var(--c-ink-mute)] mb-8">
          You'll be notified once approved. This page checks automatically every 30 seconds.
        </p>

        <div className="flex flex-col gap-3 items-center">
          <Button
            variant="ghost"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-[13px] text-[var(--c-ink-mute)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--c-warn)] animate-pulse" />
          Checking status automatically…
        </div>
      </div>
    </div>
  );
}
