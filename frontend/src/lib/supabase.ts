import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Auth features will not work.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    db: { schema: 'folio' },
    // Disable automatic PKCE code detection — AuthCallbackPage handles the
    // exchange explicitly. With detectSessionInUrl:true (default) the client
    // would consume the ?code= param on init, causing our manual call to fail.
    auth: { detectSessionInUrl: false },
  },
);
