'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '@/lib/navigation';

interface SideMenuProps {
  onNavigate?: () => void;
  variant?: 'desktop' | 'overlay';
}

/**
 * Desktop vertical navigation using the centralized nav map.
 * @param props - optional callback to close drawers on mobile
 * @returns - side menu component
 */
export default function SideMenu({ onNavigate, variant = 'desktop' }: SideMenuProps) {
  const pathname = usePathname();
  const baseClasses = variant === 'desktop' ? 'hidden lg:block' : '';

  return (
    <aside
      className={`${baseClasses} w-64 shrink-0 border-r border-slate-200 bg-white/80 p-6 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-900/80`}
      style={{ minHeight: '100vh' }}
    >
      <div className="mb-8 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">VoiceTracker</p>
        <p className="text-lg font-bold text-white">Console</p>
      </div>
      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-indigo-600/20 text-white' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
