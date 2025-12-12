// -------------------------------------------
// Page dashboard budgets (Next.js App Router)
// -------------------------------------------
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import BudgetForm from '@/components/BudgetForm';
import BudgetList from '@/components/BudgetList';
import TransactionForm from '@/components/TransactionForm';
import { BudgetLedgerService } from '@/lib/budget';
import { TransactionService } from '@/lib/transactions';

// Toujours revalider : les montants doivent refléter les dernières transactions
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Page budgets : liste master + enfants, formulaires budget et transaction.
 */
export default async function BudgetsPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;

  const budgetLedger = new BudgetLedgerService();
  const transactionService = new TransactionService();

  if (userId) {
    await budgetLedger.syncMasterToSalary(userId);
  }

  const [budgets, transactions] = userId
    ? await Promise.all([budgetLedger.listForUser(userId), transactionService.list({}, userId)])
    : [[], []];

  const dashboard = budgetLedger.buildDashboard(budgets, transactions);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BudgetForm budgets={dashboard.budgets} />
        <TransactionForm budgets={dashboard.budgets} />
      </div>
      <BudgetList budgets={dashboard.budgets} />
    </div>
  );
}
