import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import { getDashboardData } from '@/lib/dashboard';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * Generate AI insights and trends for the current user.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const snapshot = await getDashboardData(session?.user?.id);
    return json({ insights: snapshot.insights, monthlyTotals: snapshot.monthlyTotals });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate insights';
    return json({ error: message }, 400);
  }
}
