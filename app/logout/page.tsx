'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/app/providers/AuthProvider';

export default function LogoutPage() {
  const router = useRouter();
  const { supabase } = useAuth();

  useEffect(() => {
    supabase.auth.signOut().finally(() => {
      router.replace('/auth/login');
    });
  }, [router, supabase]);

  return (
    <main className="flex items-center justify-center p-6">
      <p className="text-sm text-gray-600">Déconnexion...</p>
    </main>
  );
}
