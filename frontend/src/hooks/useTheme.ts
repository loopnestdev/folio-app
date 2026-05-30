import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('folio-theme');
      // Default to dark when no preference has been saved yet
      return saved === null ? true : saved === 'dark';
    }
    catch { return true; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('folio-theme', dark ? 'dark' : 'light'); }
    catch { /* storage unavailable */ }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
