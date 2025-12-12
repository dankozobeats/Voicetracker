import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import { RecurringService } from '@/lib/recurring';

const recurringService = new RecurringService();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
    const rules = await recurringService.listRules(userId);
    const forecast = await recurringService.generateUpcomingWithCarryover(rules, userId);
    const upcoming = forecast.instances;
    const total =
      forecast.monthSummaries[0]?.sgChargesTotal ?? recurringService.computeMonthlyFixedCharges(upcoming);
    return json({ rules, upcoming, total, monthSummaries: forecast.monthSummaries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch recurring rules';
    return json({ error: message }, 400);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
    const payload = await request.json();
    const rule = await recurringService.createRule(payload, userId);
    return json({ rule }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create recurring rule';
    return json({ error: message }, 400);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
    const params = request.nextUrl.searchParams;
    const id = params.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    const payload = await request.json();
    const rule = await recurringService.updateRule(id, payload, userId);
    return json({ rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update recurring rule';
    return json({ error: message }, 400);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    await recurringService.deleteRule(id, userId);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete recurring rule';
    return json({ error: message }, 400);
  }
}
