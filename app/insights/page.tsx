import InsightCards from '@/components/InsightCards';
import { getDashboardData } from '@/lib/dashboard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * Insights page showing AI-derived recommendations and anomalies.
 */
export default async function InsightsPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const snapshot = await getDashboardData(session?.user?.id);

  return <InsightCards insights={snapshot.insights} />;
}
