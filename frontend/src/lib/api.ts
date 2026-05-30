import axios from 'axios';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000, // 30 s — prevents hanging requests from blocking loading state
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Current access token stored synchronously so the request interceptor
 * never has to await anything.
 *
 * Root cause of the previous "Authenticating..." deadlock:
 *   supabase.auth.getSession() awaits initializePromise
 *   → initializePromise awaits _notifyAllSubscribers callbacks
 *   → onAuthStateChange callback awaits fetchProfile()
 *   → fetchProfile() awaits api.post()
 *   → interceptor awaited getSession()  ← circular deadlock
 *
 * Fix: AuthContext calls setAuthToken() synchronously whenever the session
 * changes. The interceptor reads the token without any await.
 */
let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

// Request interceptor: attach Bearer token synchronously (no await)
api.interceptors.request.use((config) => {
  if (_authToken) {
    config.headers.Authorization = `Bearer ${_authToken}`;
  }
  return config;
});

// Response interceptor: handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string = error.config?.url ?? '';
    const status: number = error.response?.status;
    // Sign out on 401 only for routes OTHER than /api/auth/profile.
    // The profile bootstrap endpoint can return 401 for transient JWT issues;
    // silently signing out there would send new users to /login in a loop.
    if (status === 401 && !url.includes('/auth/profile')) {
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
