import type { DashboardSnapshot } from '@/models/insights';
import { BudgetService } from '@/lib/budget';
import { InsightService } from '@/lib/insights';
import { RecurringService } from '@/lib/recurring';
import { TransactionService } from '@/lib/transactions';

/**
 * Aggregate all dashboard-facing data in a single call for the page layer.
 * @returns - snapshot ready to render without extra calculations in the UI
 */
export async function getDashboardData(userId?: string): Promise<DashboardSnapshot> {
  const transactionService = new TransactionService();
  const budgetService = new BudgetService();
  const recurringService = new RecurringService();
  const insightService = new InsightService();

  const [transactions, monthlyTotals, budgetRules, recurringRules] = await Promise.all([
    transactionService.list({}, userId),
    transactionService.computeMonthlyTotals(userId),
    budgetService.computeBudgets(userId),
    recurringService.listRules(userId),
  ]);

  const usage = budgetService.computeCategoryUsage(monthlyTotals, budgetRules);
  const projections = budgetService.computeProjection(usage);
  const upcomingInstances = recurringService.generateUpcomingInstances(recurringRules);
  const totalFixedCharges = recurringService.computeTotalFixedCharges(upcomingInstances);

  return {
    ...insightService.buildSnapshot(transactions, monthlyTotals, usage, projections, totalFixedCharges),
    totalFixedCharges,
  };
}
