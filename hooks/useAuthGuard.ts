'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@supabase/auth-helpers-react';

export default function useAuthGuard() {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (user === null && !pathname.startsWith('/auth')) {
      router.replace('/auth/login');
    }
  }, [pathname, router, user]);
  return {
    user,
    isAuthenticated: Boolean(user),
  };
}
