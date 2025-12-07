'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import type { ThemeMode } from '@/lib/theme';

interface ThemeToggleProps {
  variant?: 'ghost' | 'solid';
}

/**
 * Small button to toggle between light and dark theme.
 * @param props - optional styling variant
 * @returns - toggle button element
 */
export default function ThemeToggle({ variant = 'ghost' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${
        variant === 'ghost'
          ? 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-indigo-500'
          : 'border-indigo-500 bg-indigo-600 text-white'
      } transition-colors`}
      aria-label="Basculer le thème"
      title={`Passer en mode ${nextTheme}`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
