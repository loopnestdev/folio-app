import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Handles the Supabase OAuth callback for both PKCE and implicit flows.
 *
 * With detectSessionInUrl: true (the default), Supabase automatically handles:
 *   - PKCE flow  → ?code= in query string → calls exchangeCodeForSession()
 *   - Implicit   → #access_token= in hash → parses tokens directly
 *
 * We must NOT call exchangeCodeForSession() manually here — the library
 * already does it, and a second call would fail with "code already used."
 * Instead we just subscribe to onAuthStateChange and navigate once the
 * session is confirmed.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Surface any OAuth-level errors (e.g. user denied consent)
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorParam) {
      setError(errorDescription ?? errorParam);
      return;
    }

    // Supabase fires SIGNED_IN (or INITIAL_SESSION with a session) once the
    // token exchange / hash parsing completes. Navigate home on either event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          // Hard redirect so AuthContext re-initialises with the persisted session.
          window.location.href = '/';
        }
      },
    );

    // Safety timeout — if nothing fires in 15 s something went wrong
    const timeout = setTimeout(() => {
      setError('Sign-in timed out. Please try again.');
    }, 15_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
