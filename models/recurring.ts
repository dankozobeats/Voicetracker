import type { TransactionCategory } from '@/models/transaction';

/**
 * Rule describing a fixed recurring charge.
 */
export interface RecurringRule {
  id: string;
  userId: string;
  amount: number;
  category: TransactionCategory;
  paymentSource: 'sg' | 'floa';
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
  direction: 'income' | 'expense';
  kind?: 'recurring' | 'carryover';
  metadata?: Record<string, unknown>;
}

/**
 * Number of months to generate forward-looking recurring instances.
 */
export const RECURRING_LOOKAHEAD_MONTHS = 24;

/**
 * Monthly projection summary including carry-over of overdraft.
 */
export interface RecurringMonthSummary {
  month: string; // YYYY-MM
  expenses: number;
  income: number;
  carryover: number;
  totalWithCarryover: number;
  overdraftRemaining: number;
  // Treasury-focused fields (added for SG/Floa forecast)
  sgChargesTotal?: number;
  floaRepaymentsTotal?: number;
  overdraftIncoming?: number;
  overdraftOutgoing?: number;
  salary?: number;
  finalBalance?: number;
  items?: {
    type: 'sg_charge' | 'floa_repayment' | 'overdraft';
    ruleId?: string;
    amount: number;
    description?: string | null;
  }[];
}
