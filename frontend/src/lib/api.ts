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

// Request interceptor: attach Supabase auth token
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
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
