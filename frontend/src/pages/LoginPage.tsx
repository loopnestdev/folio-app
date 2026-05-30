import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const { session, signInWithGoogle, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) {
      navigate('/', { replace: true });
    }
  }, [session, loading, navigate]);

  const handleSignIn = async () => {
    await signInWithGoogle();
  };

  return (
    <div className="min-h-screen bg-[var(--c-canvas-soft)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--c-primary)] rounded-2xl mb-5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 24L12 14L18 20L26 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M26 8H20M26 8V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-[34px] font-semibold tracking-tight text-[var(--c-ink)]">Folio</h1>
          <p className="text-[17px] text-[var(--c-ink-mute)] mt-2">Your portfolio, beautifully tracked.</p>
        </div>

        {/* Sign in card */}
        <div className="bg-[var(--c-canvas)] rounded-[22px] border border-[var(--c-border)] p-8">
          <h2 className="text-[22px] font-semibold text-[var(--c-ink)] mb-1">Sign in</h2>
          <p className="text-[15px] text-[var(--c-ink-mute)] mb-7">
            Use your Google account to continue.
          </p>

          <Button
            variant="secondary"
            size="lg"
            onClick={handleSignIn}
            icon={<GoogleIcon />}
            className="w-full justify-center"
          >
            Sign in with Google
          </Button>

          <div className="mt-6 pt-5 border-t border-[var(--c-border)]">
            <p className="text-[13px] text-[var(--c-ink-mute)] text-center">
              New users require admin approval before accessing the app.
            </p>
          </div>
        </div>

        <p className="text-center text-[13px] text-[var(--c-ink-mute)] mt-8">
          &copy; {new Date().getFullYear()} Folio. All rights reserved.
        </p>
      </div>
    </div>
  );
}
