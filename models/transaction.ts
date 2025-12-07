import { categories } from '@/lib/schemas';

export type TransactionCategory = (typeof categories)[number];

// -------------------------------------------
// Informations enrichies d'une catégorie (issue du join Supabase)
// -------------------------------------------
export interface CategoryInfo {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

/**
 * Canonical transaction entity used across services and UI.
 */
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  metadata?: Record<string, unknown>;
  account?: string | null;
  settlementDate?: string | null;
  category: TransactionCategory;
  categoryId?: string | null;
  categoryInfo?: CategoryInfo | null;
  budgetId?: string | null;
  description?: string | null;
  merchant?: string | null;
  date: string;
  /** @deprecated legacy naming kept for compatibility */
  expenseDate?: string;
  type?: 'income' | 'expense' | 'transfer';
  createdAt?: string;
  updatedAt?: string;
  rawTranscription?: string | null;
  deletedAt?: string | null;
}

/**
 * Filters used for transaction listing.
 */
export interface TransactionFilters {
  category?: TransactionCategory;
  startDate?: string;
  endDate?: string;
}

/**
 * Payload to insert a transaction outside of the voice pipeline.
 */
export interface TransactionInput {
  userId?: string;
  amount: number;
  account?: string | null;
  settlementDate?: string | null;
  category: TransactionCategory;
  description?: string | null;
  expenseDate: string;
  merchant?: string | null;
  rawTranscription?: string | null;
}

/**
 * Partial payload for updates while preserving existing values.
 */
export interface TransactionUpdateInput {
  amount?: number;
  category?: TransactionCategory;
  description?: string | null;
  expenseDate?: string;
}

/**
 * Aggregated totals grouped by month for analytics.
 */
export interface MonthlyTotal {
  month: string;
  /**
   * Legacy field kept for backward compatibility, mirrors expenseTotal.
   */
  total: number;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  categoryTotals: Record<TransactionCategory, number>;
}
