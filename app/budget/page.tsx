import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import BudgetManager from '@/components/BudgetManager';
import { BudgetService } from '@/lib/budget';
import { RecurringService } from '@/lib/recurring';
import { TransactionService } from '@/lib/transactions';

// -------------------------------------------
// Force le rendu dynamique pour ne jamais servir une version cachée de la page Budget
// -------------------------------------------
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Budget page consuming budget and transaction services.
 */
export default async function BudgetPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const budgetService = new BudgetService();
  const transactionService = new TransactionService();
  const recurringService = new RecurringService();

  const [monthlyTotals, budgets, recurringRules] = await Promise.all([
    transactionService.computeMonthlyTotals(userId),
    budgetService.computeBudgets(userId),
    recurringService.listRules(userId),
  ]);

  const usage = budgetService.computeCategoryUsage(monthlyTotals, budgets);
  const projections = budgetService.computeProjection(usage);
  const currentMonth = monthlyTotals[0]?.month ?? new Date().toISOString().slice(0, 7);
  const fixedCharges = recurringService.computeMonthlyFixedChargesForMonth(recurringRules, currentMonth);
  const recurringIncome = recurringService.computeMonthlyRecurringIncomeForMonth(recurringRules, currentMonth);
  const income = (monthlyTotals[0]?.incomeTotal ?? 0) + recurringIncome;
  const expenses = monthlyTotals[0]?.expenseTotal ?? monthlyTotals[0]?.total ?? 0;
  const balance = {
    month: currentMonth,
    income,
    expenses,
    fixedCharges,
    balance: income - expenses - fixedCharges,
  };

  return (
    <BudgetManager
      initialBudgets={budgets}
      initialUsage={usage}
      initialProjections={projections}
      initialBalance={balance}
    />
  );
}
