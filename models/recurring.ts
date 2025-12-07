import type { TransactionCategory } from '@/models/transaction';

/**
 * Rule describing a fixed recurring charge.
 */
export interface RecurringRule {
  id: string;
  userId: string;
  amount: number;
  category: TransactionCategory;
  description?: string | null;
  direction: 'income' | 'expense';
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth?: number | null;
  weekday?: number | null;
  startDate: string;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Upcoming instance generated from a recurring rule for previewing cash flow.
 */
export interface RecurringInstance {
  ruleId: string;
  dueDate: string;
  amount: number;
  category: TransactionCategory;
  description?: string | null;
}

/**
 * Number of months to generate forward-looking recurring instances.
 */
export const RECURRING_LOOKAHEAD_MONTHS = 24;
