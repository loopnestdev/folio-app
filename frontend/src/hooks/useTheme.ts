import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem('folio-theme') === 'dark'; }
    catch { return false; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('folio-theme', dark ? 'dark' : 'light'); }
    catch { /* storage unavailable */ }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
