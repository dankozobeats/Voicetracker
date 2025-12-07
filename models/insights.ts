import type { BudgetUsage, BudgetProjection } from '@/models/budget';
import type { MonthlyTotal, Transaction } from '@/models/transaction';

export type InsightType = 'pattern' | 'anomaly' | 'recommendation' | 'trend';

/**
 * Insight payload surfaced to the UI.
 */
export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  detail: string;
  severity?: 'low' | 'medium' | 'high';
  category?: string;
  createdAt?: string;
}

/**
 * High-level dashboard snapshot for quick rendering.
 */
export interface DashboardSnapshot {
  transactions: Transaction[];
  monthlyTotals: MonthlyTotal[];
  budgetUsage: BudgetUsage[];
  projections: BudgetProjection[];
  insights: Insight[];
  totalFixedCharges: number;
  currentMonthTotal: number;
  previousMonthTotal: number;
  monthlyChange: number;
}
