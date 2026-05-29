import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Handles the Supabase OAuth PKCE callback.
 *
 * Supabase v2 uses PKCE by default. After Google redirects back to
 * /auth/callback?code=..., we must call exchangeCodeForSession() before
 * navigating away — otherwise the code is discarded and no session is
 * created.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorParam) {
      setError(errorDescription ?? errorParam);
      return;
    }

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setError(error.message);
          } else {
            // Hard redirect so the app re-initialises with the session already
            // in localStorage. React Router navigate() can race with AuthContext
            // state updates and send AuthGuard to /login before session is set.
            window.location.href = '/';
          }
        });
    } else {
      // Fallback: no code in URL — just go home and let AuthContext sort it out
      window.location.href = '/';
    }
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <p className="text-red-600 font-medium">Sign-in failed</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-sm text-blue-600 underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500 text-sm">Signing in…</p>
    </div>
  );
}
