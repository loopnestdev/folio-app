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
    // detectSessionInUrl must stay true (the default). Setting it to false
    // causes Supabase to skip PKCE entirely and fall back to implicit flow,
    // returning #access_token= in the hash instead of ?code= in the query.
    // AuthCallbackPage uses onAuthStateChange so there is no double-exchange.
  },
);
