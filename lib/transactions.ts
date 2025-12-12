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
  'id, amount, account, settlement_date, category_id, description, merchant, date, created_at, updated_at, user_id, ai_raw, ai_source, raw_transcription, deleted_at, type, metadata, budget_id, payment_source, floa_repayment, category:categories!category_id(id, name, icon, color)';
// -------------------------------------------
// Sélection sans join, utilisée en fallback si la relation n'est pas disponible
// (restreinte aux colonnes sûres pour fonctionner même si les migrations récentes ne sont pas appliquées).
// -------------------------------------------
const BASIC_FIELDS =
  'id, amount, account, settlement_date, category_id, description, merchant, date, created_at, updated_at, user_id, ai_raw, deleted_at, type, metadata, budget_id, payment_source, floa_repayment';
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
      paymentSource: (row.payment_source as Transaction['paymentSource']) ?? 'sg',
      floaRepayment: Boolean(row.floa_repayment),
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
      rawTranscription:
        (row.raw_transcription as string | null | undefined) ??
        (row.ai_raw as string | null | undefined) ??
        null,
      aiRaw: (row.ai_raw as string | null | undefined) ?? null,
      aiSource: (row.ai_source as string | null | undefined) ?? null,
      deletedAt: (row.deleted_at as string | null | undefined) ?? null,
      type: (row.type as Transaction['type']) ?? DEFAULT_TYPE,
    };
  }

  /**
   * Détermine si une transaction correspond à un salaire (type income + catégorie/description salaire).
   */
  private isSalaryIncome(
    type: Transaction['type'] | undefined,
    category?: string | null,
    description?: string | null,
  ): boolean {
    if (type !== 'income') return false;
    const haystack = `${category ?? ''} ${description ?? ''}`.toLowerCase();
    return haystack.includes('salaire');
  }

  /**
   * Build first day of next month at noon UTC to anchor repayment dates.
   */
  private nextMonthAnchor(dateIso: string): string {
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12, 0, 0, 0);
    return new Date(utc).toISOString();
  }

  /**
   * Upsert a Floa repayment matching an original transaction for idempotency.
   * Idempotency key: user_id + floa_repayment_of + period (YYYY-MM) + floa_repayment flag.
   */
  private async ensureFloaRepayment(
    original: Transaction,
    userId: string,
    amount: number,
    description?: string | null,
  ): Promise<void> {
    const repaymentDate = this.nextMonthAnchor(original.date);
    const period = repaymentDate.slice(0, 7);
    const metadata = {
      ...((original.metadata as Record<string, unknown> | undefined) ?? {}),
      floa_repayment: true,
      floa_repayment_of: original.id,
      period,
    };

    // Clean up stale repayments tied to the same original but a different period.
    const { error: cleanupError } = await this.client
      .from(TABLE_NAME)
      .delete()
      .eq('user_id', userId)
      .eq('floa_repayment', true)
      .contains('metadata', { floa_repayment_of: original.id })
      .not('metadata->>period', 'eq', period);
    if (cleanupError) {
      console.warn('[transactions] Floa repayment cleanup failed', cleanupError);
    }

    // Check existing repayment to avoid duplicates and to update amount/date if needed.
    const { data: existing, error: lookupError } = await this.client
      .from(TABLE_NAME)
      .select('id')
      .eq('user_id', userId)
      .eq('floa_repayment', true)
      .contains('metadata', { floa_repayment_of: original.id, period })
      .maybeSingle();

    if (lookupError) {
      console.warn('[transactions] Floa repayment lookup failed', lookupError);
      return;
    }

    const payload = {
      user_id: userId,
      amount,
      type: 'expense' as const,
      account: null,
      settlement_date: null,
      category_id: null,
      description: description ? `Remboursement Floa – ${description}` : 'Remboursement Floa',
      merchant: null,
      date: repaymentDate,
      ai_raw: original.aiRaw ?? null,
      ai_source: original.aiSource ?? null,
      raw_transcription: original.rawTranscription ?? null,
      recurring_id: null,
      metadata,
      budget_id: null,
      payment_source: 'sg' as const,
      floa_repayment: true,
    };

    if (existing?.id) {
      const { error: updateError } = await this.client.from(TABLE_NAME).update(payload).eq('id', existing.id);
      if (updateError) {
        console.warn('[transactions] Floa repayment update failed', updateError);
      }
      return;
    }

    const { error: insertError } = await this.client.from(TABLE_NAME).insert(payload);
    if (insertError) {
      console.warn('[transactions] Floa repayment insert failed', insertError);
    }
  }

  /**
   * Delete an existing Floa repayment tied to an original transaction (idempotent).
   */
  private async deleteFloaRepayment(originalId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE_NAME)
      .delete()
      .eq('user_id', userId)
      .eq('floa_repayment', true)
      .contains('metadata', { floa_repayment_of: originalId });

    if (error) {
      console.warn('[transactions] Failed to delete Floa repayment', error);
    }
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
      const fallbackQuery = applyUserFilter(this.client.from(TABLE_NAME).select(BASIC_FIELDS), scopedUserId)
        .is('deleted_at', null)
        .order('date', { ascending: false });
      const { data: basicData, error: basicError }: PostgrestResponse<Record<string, unknown>> = await fallbackQuery;
      if (basicError) {
        console.warn('[transactions] Basic select failed, returning empty list', basicError);
        return [];
      }
      return (basicData ?? []).map((row) => this.mapRow(row));
    }

    const mapped = (data ?? []).map((row) => this.mapRow(row));

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

    const paymentSource = parsed.paymentSource ?? 'sg';
    const floaRepayment = parsed.floaRepayment ?? false;

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
        ai_raw: parsed.aiRaw ?? parsed.rawTranscription,
        ai_source: parsed.aiSource ?? null,
        raw_transcription: parsed.rawTranscription ?? null,
        budget_id: budgetId,
        // Persist human-readable category in metadata because DB column is a UUID.
        metadata: { ...(parsed.metadata ?? {}), category: parsed.category },
        payment_source: paymentSource,
        floa_repayment: floaRepayment,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[transactions] Failed to create transaction', error);
    }

    const created = this.mapRow(data);

    // If purchase is on Floa, ensure repayment is scheduled next month.
    if (type === 'expense' && paymentSource === 'floa' && !created.floaRepayment) {
      await this.ensureFloaRepayment(created, userId, created.amount, created.description);
    }

    if (this.isSalaryIncome(type, parsed.category, parsed.description)) {
      await this.budgetLedger.syncMasterToSalary(userId);
    }

    return created;
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
      ai_raw: parsed.aiRaw,
      ai_source: parsed.aiSource,
    };

    if (parsed.paymentSource) {
      updatePayload.payment_source = parsed.paymentSource;
    }
    if (typeof parsed.floaRepayment === 'boolean') {
      updatePayload.floa_repayment = parsed.floaRepayment;
    }

    if (parsed.type) {
      updatePayload.type = parsed.type;
    }
    if (parsed.category) {
      updatePayload.metadata = { category: parsed.category };
    } else if (parsed.metadata) {
      updatePayload.metadata = parsed.metadata;
    }

    let existingRow: Record<string, unknown> | null = null;
    if (!parsed.type || parsed.category || parsed.paymentSource || parsed.amount || parsed.expenseDate) {
      const { data: fetched, error: existingError } = await this.client
        .from(TABLE_NAME)
        .select(
          'type, payment_source, floa_repayment, amount, date, description, metadata, ai_raw, ai_source, raw_transcription, budget_id',
        )
        .eq('id', id)
        .eq('user_id', scopedUserId)
        .maybeSingle();
      if (existingError) {
        handleServiceError('[transactions] Failed to fetch transaction for budget reassignment', existingError);
      }
      existingRow = fetched ?? null;
    }

    const existingType = (existingRow?.type as Transaction['type'] | undefined) ?? undefined;
    const existingPaymentSource = (existingRow?.payment_source as Transaction['paymentSource'] | undefined) ?? 'sg';
    const existingAmount = Number(existingRow?.amount ?? parsed.amount ?? 0);
    const existingDate = (existingRow?.date as string | undefined) ?? parsed.expenseDate;
    const existingDescription = (existingRow?.description as string | null | undefined) ?? null;
    const existingMetadataCategory =
      (existingRow?.metadata as Record<string, unknown> | null | undefined)?.category as string | undefined;

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

    let mapped: Transaction | null = null;

    if (error || !data) {
      // Fallback sans join si la relation catégories est absente.
      const { data: basicData, error: basicError }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
        .from(TABLE_NAME)
        .select(BASIC_FIELDS)
        .eq('id', id)
        .eq('user_id', scopedUserId)
        .single();
      if (basicError || !basicData) {
        handleServiceError('[transactions] Failed to update transaction', error ?? basicError);
      }
      mapped = this.mapRow(basicData as Record<string, unknown>);
    } else {
      mapped = this.mapRow(data as Record<string, unknown>);
    }

    const updated = mapped;

    // Handle Floa repayment lifecycle when payment source changes (skip if this row is already a repayment).
    const newPaymentSource = parsed.paymentSource ?? existingPaymentSource;
    const wasFloa = existingPaymentSource === 'floa';
    const isFloa = newPaymentSource === 'floa';

    if (!updated.floaRepayment && targetType === 'expense') {
      if (!wasFloa && isFloa) {
        await this.ensureFloaRepayment(updated, scopedUserId, updated.amount, updated.description);
      } else if (wasFloa && !isFloa) {
        await this.deleteFloaRepayment(id, scopedUserId);
      } else if (isFloa) {
        // If still Floa but amount/date/description changed, refresh repayment idempotently.
        const effectiveAmount = parsed.amount ?? existingAmount;
        const effectiveDescription = parsed.description ?? existingDescription ?? undefined;
        const effectiveDate = parsed.expenseDate ?? existingDate ?? updated.date;
        const refreshed: Transaction = {
          ...updated,
          amount: effectiveAmount,
          description: effectiveDescription ?? null,
          date: effectiveDate,
        };
        await this.ensureFloaRepayment(refreshed, scopedUserId, effectiveAmount, effectiveDescription);
      }
    }

    const impactsSalary =
      this.isSalaryIncome(existingType, existingMetadataCategory, existingDescription) ||
      this.isSalaryIncome(updated.type, updated.category, updated.description);
    if (impactsSalary) {
      await this.budgetLedger.syncMasterToSalary(scopedUserId);
    }

    return updated;
  }

  /**
   * Soft delete a transaction by setting a deletion timestamp.
   * @param id - transaction identifier
   * @param userId - optional user scope
   */
  async softDelete(id: string, userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const { data: row } = await this.client
      .from(TABLE_NAME)
      .select('type, metadata, description')
      .eq('id', id)
      .eq('user_id', scopedUserId)
      .maybeSingle();
    const shouldSync =
      row &&
      this.isSalaryIncome(
        (row.type as Transaction['type'] | undefined) ?? undefined,
        ((row.metadata as Record<string, unknown> | null | undefined) ?? undefined)?.category as string | undefined,
        (row.description as string | null | undefined) ?? null,
      );

    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', scopedUserId);

    if (error) {
      handleServiceError('[transactions] Failed to soft delete transaction', error);
    }

    if (shouldSync) {
      await this.budgetLedger.syncMasterToSalary(scopedUserId);
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
    const { data: rows } = await this.client
      .from(TABLE_NAME)
      .select('type, metadata, description')
      .in('id', ids)
      .eq('user_id', scopedUserId);

    const shouldSync =
      rows?.some((row) =>
        this.isSalaryIncome(
          (row.type as Transaction['type'] | undefined) ?? undefined,
          ((row.metadata as Record<string, unknown> | null | undefined) ?? undefined)?.category as string | undefined,
          (row.description as string | null | undefined) ?? null,
        ),
      ) ?? false;

    const { error } = await this.client
      .from(TABLE_NAME)
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', scopedUserId);

    if (error) {
      handleServiceError('[transactions] Failed to soft delete transactions', error);
    }

    if (shouldSync) {
      await this.budgetLedger.syncMasterToSalary(scopedUserId);
    }
  }

  /**
   * Hard delete all transactions for a user (maintenance/cleanup only).
   * @param userId - optional user scope
   */
  async deleteAll(userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const { error } = await this.client.from(TABLE_NAME).delete().eq('user_id', scopedUserId);
    if (error) {
      handleServiceError('[transactions] Failed to delete all transactions', error);
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
        // Floa purchases should not impact current month; repayments do.
        const isDeferredPurchase = tx.paymentSource === 'floa' && !tx.floaRepayment;
        if (!isDeferredPurchase) {
          existing.expenseTotal += tx.amount;
          const currentCategoryTotal = existing.categoryTotals[tx.category] ?? 0;
          existing.categoryTotals[tx.category] = currentCategoryTotal + tx.amount;
        }
      }

      existing.total = existing.expenseTotal;
      existing.netTotal = existing.incomeTotal - existing.expenseTotal;
      grouped.set(monthKey, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => (a.month > b.month ? -1 : 1));
  }
}
