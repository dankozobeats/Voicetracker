import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import RecurringManager from '@/components/RecurringManager';
import { RecurringService, getFixedChargesReferenceMonth } from '@/lib/recurring';

/**
 * Recurring charges page backed by the RecurringService.
 */
export default async function RecurringPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
  if (!userId) {
    redirect('/auth/login?redirectedFrom=/recurring');
  }

  const recurringService = new RecurringService();
  const baseMonthKey = getFixedChargesReferenceMonth();
  const rules = await recurringService.listRules(userId);
  const forecast = await recurringService.generateUpcomingWithCarryover(rules, userId, undefined, baseMonthKey);
  const upcoming = forecast.instances;
  const total = forecast.monthSummaries[0]?.sgChargesTotal ?? 0;

  return (
    <RecurringManager
      initialRules={rules}
      initialUpcoming={upcoming}
      initialMonthSummaries={forecast.monthSummaries}
      initialTotal={total}
    />
  );
}
