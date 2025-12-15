'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserSupabaseClient, type Session, type SupabaseClient, type User } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

type AuthContextValue = {
  user: User | null;
  supabase: SupabaseClient;
  session: Session | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider wires Supabase auth into the client tree and exposes the current user.
 * It also forwards the Supabase client through context for easy consumption in UI layers.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!isMounted) return;
      if (event === 'TOKEN_REFRESH_FAILED') {
        await supabase.auth.signOut().catch(() => undefined);
        if (pathname && !pathname.startsWith('/auth')) {
          router.replace('/auth/login');
        }
      } else if (event === 'SIGNED_OUT') {
        if (pathname && !pathname.startsWith('/auth')) {
          router.replace('/auth/login');
        }
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  const value = useMemo(
    () => ({
      user,
      supabase,
      session,
    }),
    [session, supabase, user],
  );

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={session}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </SessionContextProvider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
