import type { TransactionCategory } from '@/models/transaction';

/**
 * Budget rule persisted in Supabase.
 */
export interface BudgetRule {
  id: string;
  userId: string;
  category: TransactionCategory;
  monthlyLimit: number;
  alertThreshold: number;
  startDate?: string;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Summary of budget consumption for a given category.
 */
export interface BudgetUsage {
  category: TransactionCategory;
  spent: number;
  limit: number;
  remaining: number;
  threshold: number;
  status: 'ok' | 'warning' | 'over';
}

/**
 * Projected spend and runway estimation for a category.
 */
export interface BudgetProjection {
  category: TransactionCategory;
  projectedSpend: number;
  limit: number;
  overrunDelta: number;
}

/**
 * Summary of overall monthly balance combining income, expenses and fixed charges.
 */
export interface BudgetBalance {
  month: string;
  income: number;
  expenses: number;
  fixedCharges: number;
  balance: number;
}
