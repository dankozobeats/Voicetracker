import { NextResponse } from 'next/server';

import { getServerSupabaseClient } from '@/lib/supabase';

const jsonResponse = (body: unknown, status = 200) => NextResponse.json(body, { status });

const normalizeUserFilter = (query: ReturnType<ReturnType<typeof getServerSupabaseClient>['from']>) => {
  const userId = process.env.SUPABASE_DEFAULT_USER_ID?.trim();
  return userId ? query.eq('user_id', userId) : query;
};

export async function GET(): Promise<Response> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await normalizeUserFilter(
    supabase
      .from('expenses')
      .select('id, amount, category, description, expense_date, created_at'),
  )
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[api/expenses] Failed to fetch expenses', error);
    return jsonResponse({ error: 'Unable to fetch expenses' }, 500);
  }

  return jsonResponse({ expenses: data ?? [] });
}
