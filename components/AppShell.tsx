'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import MobileNav from '@/components/MobileNav';
import MicroFAB from '@/components/MicroFAB';
import SideMenu from '@/components/SideMenu';
import TopBar from '@/components/TopBar';
import useAuthGuard from '@/hooks/useAuthGuard';

interface AppShellProps {
  children: React.ReactNode;
}

const FULLSCREEN_ROUTES = ['/record'];
const HIDE_SIDEMENU_ROUTES = ['/deferred'];

/**
 * Global SaaS shell with sidebar, top bar, mobile drawer, and bottom nav.
 * @param props - page content
 * @returns - layout container
 */
export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarState, setSidebarState] = useState<'auto' | 'hidden' | 'visible'>('auto');
  const { user, isAuthenticated } = useAuthGuard();

  const isFullScreen = useMemo(() => FULLSCREEN_ROUTES.some((route) => pathname.startsWith(route)), [pathname]);
  const routeForcesHide = useMemo(
    () => HIDE_SIDEMENU_ROUTES.some((route) => pathname.startsWith(route)),
    [pathname],
  );
  const hideSideMenu = useMemo(() => {
    if (sidebarState === 'hidden') return true;
    if (sidebarState === 'visible') return false;
    return routeForcesHide;
  }, [sidebarState, routeForcesHide]);

  const handleToggleSidebar = () => {
    setSidebarState((prev) => {
      if (prev === 'hidden') return 'visible';
      if (prev === 'visible') return 'hidden';
      return routeForcesHide ? 'visible' : 'hidden';
    });
  };

  useEffect(() => {
    if (!isAuthenticated && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [drawerOpen, isAuthenticated]);

  const hasNavigation = isAuthenticated;

  if (isFullScreen) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-50">
      <div className="flex min-h-screen w-full max-w-full overflow-x-hidden">

        {hasNavigation && !hideSideMenu ? <SideMenu /> : null}
        <div className="flex flex-1 min-w-0 flex-col lg:pl-0">
          {hasNavigation ? (
            <TopBar
              pathname={pathname}
              onMenuClick={() => setDrawerOpen(true)}
              onToggleSidebar={handleToggleSidebar}
              sidebarHidden={hideSideMenu}
            />
          ) : null}
          <main className="flex-1 min-w-0 px-4 pb-20 pt-4 md:px-6 md:pb-10 lg:px-8 overflow-x-hidden">
{children}</main>
        </div>
      </div>
      {hasNavigation ? <MobileNav /> : null}
      {hasNavigation ? <MicroFAB /> : null}

      {hasNavigation && drawerOpen ? (
        <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true">
          <div className="h-full w-72 max-w-[80vw] border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">VoiceTracker</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Navigation</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-slate-300 bg-white/80 px-2 py-1 text-xs text-slate-700 hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <SideMenu variant="overlay" onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button className="h-full flex-1" type="button" onClick={() => setDrawerOpen(false)} aria-label="Fermer le menu" />
        </div>
      ) : null}
    </div>
  );
}
