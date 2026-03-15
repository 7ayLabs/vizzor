'use client';

import { useState, useCallback, useEffect } from 'react';
import { type Theme, getStoredTheme, setTheme as applyTheme } from '@/lib/theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  }, []);

  return { theme, setTheme } as const;
}
