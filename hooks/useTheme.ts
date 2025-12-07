'use client';

import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from '@/lib/theme';

/**
 * Consume the theme context with safety check to avoid null usage.
 * @returns - theme context value
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
