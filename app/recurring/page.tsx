import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import RecurringManager from '@/components/RecurringManager';
import { RecurringService } from '@/lib/recurring';

/**
 * Recurring charges page backed by the RecurringService.
 */
export default async function RecurringPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const recurringService = new RecurringService();
  const rules = await recurringService.listRules(userId);
  const upcoming = recurringService.generateUpcomingInstances(rules);
  const total = recurringService.computeTotalFixedCharges(upcoming);

  return <RecurringManager initialRules={rules} initialUpcoming={upcoming} initialTotal={total} />;
}
