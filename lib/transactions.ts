import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

import type {
  MonthlyTotal,
  Transaction,
  TransactionCategory,
  TransactionFilters,
  TransactionInput,
  TransactionUpdateInput,
} from '@/models/transaction';
import { BudgetLedgerService } from '@/lib/budget';
import { parseTransactionInput, parseTransactionUpdate } from '@/lib/validation';
import { applyUserFilter, handleServiceError, resolveUserId } from '@/lib/utils';
import { getServerSupabaseClient } from '@/lib/supabase';

const TABLE_NAME = 'transactions';
// -------------------------------------------
// Sélection par défaut incluant le join catégorie (nom, icône, couleur) pour enrichir l'UI
// -------------------------------------------
const SELECT_FIELDS =
  // Joins Supabase : on cible explicitement la FK category_id pour éviter les erreurs de relation
  'id, amount, account, settlement_date, category_id, description, merchant, date, created_at, updated_at, user_id, ai_raw, deleted_at, type, metadata, budget_id, category:categories!category_id(id, name, icon, color)';
// -------------------------------------------
// Sélection sans join, utilisée en fallback si la relation n'est pas disponible
// -------------------------------------------
const BASIC_FIELDS =
  'id, amount, category_id, description, merchant, date, created_at, updated_at, user_id, ai_raw, deleted_at, type, metadata, budget_id';
const DEFAULT_CATEGORY: TransactionCategory = 'autre';
const DEFAULT_TYPE: Transaction['type'] = 'expense';

/**
 * Service responsible for CRUD operations on transactions (non-vocal flow).
 */
export class TransactionService {
  private client = getServerSupabaseClient();
  private budgetLedger = new BudgetLedgerService(this.client);

  /**
   * Convert a raw Supabase row into the domain transaction model.
   * @param row - database record
   * @returns - normalized transaction
   */
  private mapRow(row: Record<string, unknown>): Transaction {
    const date = String(row.date ?? row.expense_date ?? new Date().toISOString());
    const categoryInfo = (row.category as Record<string, unknown> | null | undefined) ?? null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      amount: Number(row.amount),
      metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? undefined,
      account: (row.account as string | null | undefined) ?? null,
      settlementDate: (row.settlement_date as string | null | undefined) ?? null,
      categoryId: (row.category_id as string | null | undefined) ?? null,
      // Prefer user-provided category stored in metadata; fallback to legacy default.
      category: ((row.metadata as Record<string, unknown> | null | undefined)?.category as TransactionCategory | undefined) ?? DEFAULT_CATEGORY,
      categoryInfo: categoryInfo
        ? {
            id: String(categoryInfo.id),
            name: String(categoryInfo.name ?? ''),
            icon: (categoryInfo.icon as string | null | undefined) ?? null,
            color: (categoryInfo.color as string | null | undefined) ?? null,
          }
        : null,
      budgetId: (row.budget_id as string | null | undefined) ?? null,
      description: (row.description as string | null | undefined) ?? null,
      merchant: (row.merchant as string | null | undefined) ?? null,
      date,
      expenseDate: date,
      createdAt: row.created_at as string | undefined,
      updatedAt: row.updated_at as string | undefined,
      rawTranscription: (row.ai_raw as string | null | undefined) ?? (row.raw_transcription as string | null | undefined) ?? null,
      deletedAt: (row.deleted_at as string | null | undefined) ?? null,
      type: (row.type as Transaction['type']) ?? DEFAULT_TYPE,
    };
  }

  /**
   * List transactions scoped by user and optional filters.
   * @param filters - optional category or date range constraints
   * @param userId - override user id (defaults to env)
   * @returns - ordered list of transactions
   */
  async list(filters: TransactionFilters = {}, userId?: string): Promise<Transaction[]> {
    const scopedUserId = resolveUserId(userId);
    let query = applyUserFilter(this.client.from(TABLE_NAME).select(SELECT_FIELDS), scopedUserId).order('date', {
      ascending: false,
    });

    // category filter skipped because category_id is not mapped to names yet
    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }
    query = query.is('deleted_at', null);

    const { data, error }: PostgrestResponse<Record<string, unknown>> = await query;

    // -------------------------------------------
    // Si le join échoue (relation manquante), on refait une requête sans join pour ne pas masquer les données
    // -------------------------------------------
    if (error) {
      console.warn('[transactions] Join categories failed, falling back to basic select', error);
      const fallbackQuery = applyUserFilter(this.client.from(TABLE_NAME).select(BASIC_FIELDS), scopedUserId).order(
        'date',
        { ascending: false },
      );
      const { data: basicData, error: basicError }: PostgrestResponse<Record<string, unknown>> = await fallbackQuery;
      if (basicError) {
        console.warn('[transactions] Basic select failed, returning empty list', basicError);
        return [];
      }
      return (basicData ?? []).map((row) => this.mapRow(row));
    }

    const mapped = (data ?? []).map((row) => this.mapRow(row));

    // -------------------------------------------
    // En développement : si aucun résultat, on tente un fallback sans filtre user pour retrouver d'anciennes données
    // (utile quand l'ID utilisateur a changé). Ne s'exécute pas en production.
    // -------------------------------------------
    if (mapped.length === 0 && process.env.NODE_ENV === 'development') {
      const { data: unscopedData, error: unscopedError }: PostgrestResponse<Record<string, unknown>> = await this.client
        .from(TABLE_NAME)
        .select(BASIC_FIELDS)
        .order('date', { ascending: false });
      if (!unscopedError && unscopedData) {
        return unscopedData.map((row) => this.mapRow(row));
      }
    }

    return mapped;
  }

  /**
   * Create a transaction without using the voice pipeline.
   * @param payload - transaction data
   * @returns - created transaction
   */
  async create(payload: TransactionInput): Promise<Transaction> {
    const parsed = parseTransactionInput(payload);
    const userId = resolveUserId(parsed.userId, { required: true });

    const type = parsed.type ?? DEFAULT_TYPE;
    let budgetId: string | null = null;
    if (type === 'expense') {
      const budgets = await this.budgetLedger.listForUser(userId);
      const matchedBudget = this.budgetLedger.matchBudgetForCategory(parsed.category, budgets);
      budgetId = matchedBudget?.id ?? null;
    }

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>[]> = await this.client
      .from(TABLE_NAME)
      .insert({
        user_id: userId,
        amount: parsed.amount,
        type,
        account: parsed.account,
        settlement_date: parsed.settlementDate ?? null,
        category_id: null,
        description: parsed.description,
        merchant: null,
        date: parsed.expenseDate,
        ai_raw: parsed.rawTranscription,
        budget_id: budgetId,
        // Persist human-readable category in metadata because DB column is a UUID.
        metadata: { category: parsed.category },
      })
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[transactions] Failed to create transaction', error);
    }

    return this.mapRow(data);
  }

  /**
   * Update a transaction fields while preserving immutable data.
   * @param id - transaction identifier
   * @param payload - partial fields to update
   * @param userId - optional user scope
   * @returns - updated transaction
   */
  async update(id: string, payload: TransactionUpdateInput, userId?: string): Promise<Transaction> {
    const parsed = parseTransactionUpdate(payload);
    const scopedUserId = resolveUserId(userId, { required: true });

    const updatePayload: Record<string, unknown> = {
      amount: parsed.amount,
      account: parsed.account,
      settlement_date: parsed.settlementDate,
      category_id: null,
      description: parsed.description,
      merchant: null,
      date: parsed.expenseDate,
      updated_at: new Date().toISOString(),
    };

    if (parsed.type) {
      updatePayload.type = parsed.type;
    }
    if (parsed.category) {
      updatePayload.metadata = { category: parsed.category };
    }

    let existingType: Transaction['type'] | undefined;
    if (!parsed.type && parsed.category) {
      const { data: existingRow, error: existingError } = await this.client
        .from(TABLE_NAME)
        .select('type')
        .eq('id', id)
        .eq('user_id', scopedUserId)
        .maybeSingle();
      if (existingError) {
        handleServiceError('[transactions] Failed to fetch transaction for budget reassignment', existingError);
      }
      existingType = (existingRow?.type as Transaction['type'] | undefined) ?? undefined;
    }

    const targetType = parsed.type ?? existingType ?? DEFAULT_TYPE;
    if (targetType !== 'expense') {
      updatePayload.budget_id = null;
    } else if (parsed.category) {
      const budgets = await this.budgetLedger.listForUser(scopedUserId);
      const matchedBudget = this.budgetLedger.matchBudgetForCategory(parsed.category, budgets);
      updatePayload.budget_id = matchedBudget?.id ?? null;
    }

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
      .from(TABLE_NAME)
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', scopedUserId)
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[transactions] Failed to update transaction', error);
    }

    return this.mapRow(data);
  }

  /**
   * Soft delete a transaction by setting a deletion timestamp.
   * @param id - transaction identifier
   * @param userId - optional user scope
   */
  async softDelete(id: string, userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', scopedUserId);

    if (error) {
      handleServiceError('[transactions] Failed to soft delete transaction', error);
    }
  }

  /**
   * Soft delete multiple transactions at once.
   * @param ids - list of transaction identifiers
   * @param userId - optional user scope
   */
  async softDeleteMany(ids: string[], userId?: string): Promise<void> {
    if (!ids.length) return;
    const scopedUserId = resolveUserId(userId, { required: true });
    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', scopedUserId);

    if (error) {
      handleServiceError('[transactions] Failed to soft delete transactions', error);
    }
  }

  /**
   * Compute monthly totals and per-category totals for dashboard charts.
   * @param userId - optional user scope
   * @returns - aggregated totals per ISO month
   */
  async computeMonthlyTotals(userId?: string): Promise<MonthlyTotal[]> {
    const transactions = await this.list({}, userId);
    const grouped = new Map<string, MonthlyTotal>();

    // Aggregate per month to keep UI simple to render stacked cards.
    for (const tx of transactions) {
      const monthKey = tx.date.slice(0, 7); // YYYY-MM
      const existing = grouped.get(monthKey) ?? {
        month: monthKey,
        total: 0,
        expenseTotal: 0,
        incomeTotal: 0,
        netTotal: 0,
        categoryTotals: {} as Record<TransactionCategory, number>,
      };

      // Treat undefined type as expense to preserve previous behavior.
      const kind = tx.type ?? 'expense';
      if (kind === 'income') {
        existing.incomeTotal += tx.amount;
      } else if (kind !== 'transfer') {
        existing.expenseTotal += tx.amount;
        const currentCategoryTotal = existing.categoryTotals[tx.category] ?? 0;
        existing.categoryTotals[tx.category] = currentCategoryTotal + tx.amount;
      }

      existing.total = existing.expenseTotal;
      existing.netTotal = existing.incomeTotal - existing.expenseTotal;
      grouped.set(monthKey, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => (a.month > b.month ? -1 : 1));
  }
}
