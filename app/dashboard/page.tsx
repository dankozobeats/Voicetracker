import BudgetCards from '@/components/BudgetCards';
import DashboardCards from '@/components/DashboardCards';
import InsightCards from '@/components/InsightCards';
import TransactionTable from '@/components/TransactionTable';
import { getDashboardData } from '@/lib/dashboard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * Dashboard page leveraging precomputed snapshot data.
 */
export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const snapshot = await getDashboardData(session?.user?.id);

  return (
    <div className="space-y-6">
      <DashboardCards snapshot={snapshot} />
      <BudgetCards usage={snapshot.budgetUsage} projections={snapshot.projections} />
      <InsightCards insights={snapshot.insights} />
      <TransactionTable transactions={snapshot.transactions.slice(0, 10)} />
    </div>
  );
}
