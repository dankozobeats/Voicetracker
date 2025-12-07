'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

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
