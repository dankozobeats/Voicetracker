import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

export function getServerSupabaseClient(): SupabaseClient {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for server client');
  }

  if (!key.startsWith('eyJ') && key.length < 20) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY appears invalid');
  }

  serverClient = createClient(url, key, { auth: { persistSession: false } });
  return serverClient;
}

export function getPublicSupabaseClient(): SupabaseClient {
  if (publicClient) return publicClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for public client');

  publicClient = createClient(url, anon, { auth: { persistSession: false } });
  return publicClient;
}
