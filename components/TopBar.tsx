'use client';

import { Bell, Menu, User } from 'lucide-react';
import Link from 'next/link';

import { NAV_ITEMS } from '@/lib/navigation';
import ThemeToggle from '@/components/ThemeToggle';

interface TopBarProps {
  pathname: string;
  onMenuClick?: () => void;
  userName?: string;
  userEmail?: string;
}

/**
 * Sticky top bar with title, user menu, and theme toggle.
 * @param props - current pathname and callbacks for mobile drawer
 * @returns - header component
 */
export default function TopBar({ pathname, onMenuClick, userName = 'User', userEmail = 'user@example.com' }: TopBarProps) {
  const currentNav = NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white/70 text-slate-700 hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{currentNav?.id ?? 'VoiceTracker'}</p>
          <p className="text-lg font-semibold text-white">{currentNav?.label ?? 'VoiceTracker'}</p>
        </div>
      </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white/70 text-slate-700 hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 sm:inline-flex"
          >
            <Bell className="h-4 w-4" />
          </button>
          <details className="group relative">
          <summary className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/80 text-white">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{userName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{userEmail}</p>
            </div>
          </summary>
          <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900/90">
            <Link href="/settings" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60">
              Paramètres
            </Link>
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              Se déconnecter
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
