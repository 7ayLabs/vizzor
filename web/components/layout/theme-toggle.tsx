'use client';

import { useTheme } from '@/hooks/use-theme';
import type { Theme } from '@/lib/theme';

const cycle: Theme[] = ['dark', 'light', 'system'];

const ICONS: Record<Theme, string> = {
  dark: 'fa-solid fa-moon',
  light: 'fa-solid fa-sun',
  system: 'fa-solid fa-desktop',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = cycle.indexOf(theme);
    const nextTheme = cycle[(idx + 1) % cycle.length] ?? 'dark';
    setTheme(nextTheme);
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center justify-center size-9 sm:size-8 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)] active:bg-[var(--border)] transition-colors touch-target"
      title={`Theme: ${theme}`}
    >
      <i className={`${ICONS[theme]} text-xs`} />
    </button>
  );
}
