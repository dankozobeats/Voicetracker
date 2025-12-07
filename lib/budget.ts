import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

import type { BudgetProjection, BudgetRule, BudgetUsage } from '@/models/budget';
import type { MonthlyTotal, Transaction, TransactionCategory } from '@/models/transaction';
import type { BudgetDashboard, BudgetEntity, BudgetPayload, BudgetWithUsage } from '@/types/budget';
import { parseBudgetRule } from '@/lib/validation';
import { applyUserFilter, handleServiceError, resolveUserId } from '@/lib/utils';
import { getServerSupabaseClient } from '@/lib/supabase';

const TABLE_NAME = 'budget_rules';
const SELECT_FIELDS =
  'id, user_id, category, monthly_limit, alert_threshold, start_date, end_date, created_at, updated_at';
const BUDGET_TABLE = 'budgets';
const BUDGET_SELECT =
  'id, user_id, name, amount, remaining, is_master, parent_id, category, created_at, updated_at';

/**
 * Service for handling budget rules and derived calculations.
 */
export class BudgetService {
  private client = getServerSupabaseClient();

  /**
   * Convert raw database rows to the budget model.
   * @param row - database row
   * @returns - normalized budget rule
   */
  private mapRow(row: Record<string, unknown>): BudgetRule {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      category: row.category as BudgetRule['category'],
      monthlyLimit: Number(row.monthly_limit),
      alertThreshold: Number(row.alert_threshold),
      startDate: row.start_date as string,
      endDate: (row.end_date as string | null | undefined) ?? null,
      createdAt: row.created_at as string | undefined,
      updatedAt: row.updated_at as string | undefined,
    };
  }

  /**
   * Create a budget rule scoped to the authenticated user.
   * @param payload - rule data
   * @param userId - optional user override
   * @returns - created budget rule
   */
  async createRule(payload: unknown, userId?: string): Promise<BudgetRule> {
    const parsed = parseBudgetRule(payload);
    const scopedUserId = resolveUserId(parsed.userId ?? userId, { required: true });

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
      .from(TABLE_NAME)
      .insert({
        user_id: scopedUserId,
        category: parsed.category,
        monthly_limit: parsed.monthlyLimit,
        alert_threshold: parsed.alertThreshold,
        start_date: parsed.startDate,
        end_date: parsed.endDate,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[budget] Failed to create budget rule', error);
    }

    return this.mapRow(data);
  }

  /**
   * Update an existing budget rule.
   * @param id - rule identifier
   * @param payload - raw rule payload
   * @param userId - optional user override
   * @returns - updated budget rule
   */
  async updateRule(id: string, payload: unknown, userId?: string): Promise<BudgetRule> {
    const parsed = parseBudgetRule(payload);
    const scopedUserId = resolveUserId(parsed.userId ?? userId, { required: true });

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
      .from(TABLE_NAME)
      .update({
        category: parsed.category,
        monthly_limit: parsed.monthlyLimit,
        alert_threshold: parsed.alertThreshold,
        start_date: parsed.startDate,
        end_date: parsed.endDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', scopedUserId)
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[budget] Failed to update budget rule', error);
    }

    return this.mapRow(data);
  }

  /**
   * Delete a budget rule.
   * @param id - rule identifier
   * @param userId - optional user override
   */
  async deleteRule(id: string, userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const { error } = await this.client.from(TABLE_NAME).delete().eq('id', id).eq('user_id', scopedUserId);
    if (error) {
      handleServiceError('[budget] Failed to delete budget rule', error);
    }
  }

  /**
   * Fetch all budget rules for a user.
   * @param userId - optional user override
   * @returns - list of budget rules
   */
  async computeBudgets(userId?: string): Promise<BudgetRule[]> {
    const scopedUserId = resolveUserId(userId);
    const { data, error }: PostgrestResponse<Record<string, unknown>> = await applyUserFilter(
      this.client.from(TABLE_NAME).select(SELECT_FIELDS),
      scopedUserId,
    )
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      handleServiceError('[budget] Failed to fetch budget rules', error);
    }

    return (data ?? []).map((row) => this.mapRow(row));
  }

  /**
   * Compute current usage for each budget rule based on the latest month totals.
   * @param monthlyTotals - aggregated transaction totals
   * @param budgets - list of budget rules
   * @returns - budget usage status list
   */
  computeCategoryUsage(monthlyTotals: MonthlyTotal[], budgets: BudgetRule[]): BudgetUsage[] {
    const latestMonth = monthlyTotals[0]?.month;
    const latestTotals = monthlyTotals.find((total) => total.month === latestMonth)?.categoryTotals ?? {};

    return budgets.map((rule) => {
      const spent = latestTotals[rule.category] ?? 0;
      const remaining = Math.max(rule.monthlyLimit - spent, 0);
      const warningLimit = rule.monthlyLimit * rule.alertThreshold;
      const status: BudgetUsage['status'] = spent >= rule.monthlyLimit ? 'over' : spent >= warningLimit ? 'warning' : 'ok';

      return {
        category: rule.category,
        spent,
        limit: rule.monthlyLimit,
        remaining,
        threshold: rule.alertThreshold,
        status,
      };
    });
  }

  /**
   * Compute budget usage including fetching budgets when not provided.
   * @param monthlyTotals - aggregated totals
   * @param userId - optional user override
   * @returns - usage by category
   */
  async computeRemaining(monthlyTotals: MonthlyTotal[], userId?: string): Promise<BudgetUsage[]> {
    const budgets = await this.computeBudgets(userId);
    return this.computeCategoryUsage(monthlyTotals, budgets);
  }

  /**
   * Estimate end-of-month projection given current progress in the month.
   * @param usage - budget usage list
   * @returns - projections per category
   */
  computeProjection(usage: BudgetUsage[]): BudgetProjection[] {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const progress = Math.max(today.getDate(), 1) / daysInMonth;

    // Project spend linearly to give a quick runway estimate.
    return usage.map((entry) => {
      const projectedSpend = progress > 0 ? entry.spent / progress : entry.spent;
      const overrunDelta = Math.max(projectedSpend - entry.limit, 0);
      return {
        category: entry.category,
        projectedSpend,
        limit: entry.limit,
        overrunDelta,
      };
    });
  }
}

/**
 * Service gérant les budgets hiérarchiques (master + sous-budgets) et leur consommation.
 */
export class BudgetLedgerService {
  constructor(private client = getServerSupabaseClient()) {}

  /**
   * Convertit une ligne brute Supabase vers le modèle BudgetEntity.
   */
  private mapBudgetRow(row: Record<string, unknown>): BudgetEntity {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      name: String(row.name),
      amount: Number(row.amount),
      remaining: Number(row.remaining),
      isMaster: Boolean(row.is_master),
      parentId: (row.parent_id as string | null | undefined) ?? null,
      category: (row.category as TransactionCategory | null | undefined) ?? null,
      createdAt: row.created_at as string | undefined,
      updatedAt: row.updated_at as string | undefined,
    };
  }

  /**
   * Récupère le budget principal pour l'utilisateur, s'il existe.
   */
  private async fetchMaster(userId: string): Promise<BudgetEntity | null> {
    const { data, error } = await this.client
      .from(BUDGET_TABLE)
      .select(BUDGET_SELECT)
      .eq('user_id', userId)
      .eq('is_master', true)
      .maybeSingle();

    if (error) {
      handleServiceError('[budget-ledger] Failed to fetch master budget', error);
    }

    return data ? this.mapBudgetRow(data) : null;
  }

  /**
   * Récupère un budget par id (scopé à l'utilisateur).
   */
  private async fetchBudget(id: string, userId: string): Promise<BudgetEntity | null> {
    const { data, error } = await this.client
      .from(BUDGET_TABLE)
      .select(BUDGET_SELECT)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      handleServiceError('[budget-ledger] Failed to fetch budget', error);
    }

    return data ? this.mapBudgetRow(data) : null;
  }

  /**
   * Calcule le restant du master en fonction des enveloppes déjà créées.
   */
  private computeMasterRemaining(master: BudgetEntity, budgets: BudgetEntity[]): number {
    const allocated = budgets.filter((b) => b.parentId === master.id).reduce((sum, b) => sum + b.amount, 0);
    return master.amount - allocated;
  }

  /**
   * Liste tous les budgets d'un utilisateur.
   */
  async listForUser(userId?: string): Promise<BudgetEntity[]> {
    const scopedUserId = resolveUserId(userId);
    const query = applyUserFilter(this.client.from(BUDGET_TABLE).select(BUDGET_SELECT), scopedUserId)
      .order('is_master', { ascending: false })
      .order('created_at', { ascending: true });

    const { data, error } = await query;
    if (error) {
      handleServiceError('[budget-ledger] Failed to list budgets', error);
    }

    return (data ?? []).map((row) => this.mapBudgetRow(row));
  }

  /**
   * Crée un budget principal ou un sous-budget.
   */
  async createBudget(payload: BudgetPayload, userId?: string): Promise<BudgetEntity> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const normalizedName = String(payload.name ?? '').trim();
    const normalizedAmount = Number(payload.amount);
    if (!normalizedName || Number.isNaN(normalizedAmount) || normalizedAmount < 0) {
      throw new Error('name and amount are required');
    }

    const budgets = await this.listForUser(scopedUserId);
    const master = budgets.find((b) => b.isMaster) ?? null;

    if (payload.isMaster) {
      if (master) {
        throw new Error('Un budget principal existe déjà');
      }
      const { data, error } = await this.client
        .from(BUDGET_TABLE)
        .insert({
          user_id: scopedUserId,
          name: normalizedName,
          amount: normalizedAmount,
          remaining: normalizedAmount,
          is_master: true,
          parent_id: null,
          category: null,
        })
        .select(BUDGET_SELECT)
        .single();

      if (error || !data) {
        handleServiceError('[budget-ledger] Failed to create master budget', error);
      }

      return this.mapBudgetRow(data);
    }

    if (!master) {
      throw new Error('Créez d’abord un budget principal');
    }

    const parentId = payload.parentId ?? master.id;
    if (parentId !== master.id) {
      throw new Error('Un sous-budget doit être rattaché au budget principal');
    }
    if (!payload.category) {
      throw new Error('category is required for sub-budgets');
    }

    const { data, error } = await this.client
      .from(BUDGET_TABLE)
      .insert({
        user_id: scopedUserId,
        name: normalizedName,
        amount: normalizedAmount,
        remaining: normalizedAmount,
        is_master: false,
        parent_id: parentId,
        category: payload.category,
      })
      .select(BUDGET_SELECT)
      .single();

    if (error || !data) {
      handleServiceError('[budget-ledger] Failed to create budget', error);
    }

    // Met à jour le restant du master pour refléter la nouvelle enveloppe.
    const newMasterRemaining = this.computeMasterRemaining(master, budgets) - normalizedAmount;
    await this.client
      .from(BUDGET_TABLE)
      .update({ remaining: newMasterRemaining, updated_at: new Date().toISOString() })
      .eq('id', master.id)
      .eq('user_id', scopedUserId);

    return this.mapBudgetRow(data);
  }

  /**
   * Met à jour un budget (ajustement du master ou d'une enveloppe).
   */
  async updateBudget(id: string, payload: BudgetPayload, userId?: string): Promise<BudgetEntity> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const normalizedName = String(payload.name ?? '').trim();
    const normalizedAmount = Number(payload.amount);
    if (!normalizedName || Number.isNaN(normalizedAmount) || normalizedAmount < 0) {
      throw new Error('name and amount are required');
    }

    const budgets = await this.listForUser(scopedUserId);
    const existing = budgets.find((b) => b.id === id);
    if (!existing) {
      throw new Error('Budget introuvable');
    }
    if (payload.isMaster !== existing.isMaster) {
      throw new Error('Impossible de changer le type du budget');
    }

    if (existing.isMaster) {
      const allocated = budgets.filter((b) => b.parentId === existing.id).reduce((sum, b) => sum + b.amount, 0);
      if (normalizedAmount < allocated) {
        throw new Error('Le montant du budget principal doit couvrir les enveloppes existantes');
      }
      const remaining = normalizedAmount - allocated;

      const { data, error } = await this.client
        .from(BUDGET_TABLE)
        .update({
          name: normalizedName,
          amount: normalizedAmount,
          remaining,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', scopedUserId)
        .select(BUDGET_SELECT)
        .single();

      if (error || !data) {
        handleServiceError('[budget-ledger] Failed to update master budget', error);
      }

      return this.mapBudgetRow(data);
    }

    // Mise à jour d'une enveloppe enfant
    const master = budgets.find((b) => b.isMaster) ?? null;
    if (!master) {
      throw new Error('Aucun budget principal configuré');
    }
    if (existing.parentId && existing.parentId !== master.id) {
      throw new Error('Le budget enfant doit rester rattaché au budget principal');
    }

    const { data: txRows, error: txError } = await this.client
      .from('transactions')
      .select('amount, type')
      .eq('user_id', scopedUserId)
      .eq('budget_id', id)
      .is('deleted_at', null);

    if (txError) {
      handleServiceError('[budget-ledger] Failed to compute spent for budget', txError);
    }

    const spentSoFar = (txRows ?? []).reduce((sum, row) => {
      const type = (row.type as Transaction['type'] | undefined) ?? 'expense';
      if (type === 'income' || type === 'transfer') return sum;
      const amount = Number(row.amount);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
    const remaining = Math.max(normalizedAmount - spentSoFar, 0);

    const { data, error } = await this.client
      .from(BUDGET_TABLE)
      .update({
        name: normalizedName,
        amount: normalizedAmount,
        remaining,
        category: payload.category ?? existing.category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', scopedUserId)
      .select(BUDGET_SELECT)
      .single();

    if (error || !data) {
      handleServiceError('[budget-ledger] Failed to update budget', error);
    }

    // Ajuste le restant du master en fonction du nouveau montant.
    const newMasterRemaining = master.amount - (allocatedOthers + normalizedAmount);
    await this.client
      .from(BUDGET_TABLE)
      .update({ remaining: newMasterRemaining, updated_at: new Date().toISOString() })
      .eq('id', master.id)
      .eq('user_id', scopedUserId);

    return this.mapBudgetRow(data);
  }

  /**
   * Supprime un budget enfant et restitue le montant au master.
   */
  async deleteBudget(id: string, userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const budgets = await this.listForUser(scopedUserId);
    const budget = budgets.find((b) => b.id === id);
    if (!budget) throw new Error('Budget introuvable');

    // Suppression du master : on supprime toute la hiérarchie et on détache les transactions.
    if (budget.isMaster) {
      const allIds = budgets.map((b) => b.id);
      if (allIds.length) {
        const { error: txError } = await this.client
          .from('transactions')
          .update({ budget_id: null })
          .in('budget_id', allIds)
          .eq('user_id', scopedUserId);
        if (txError) {
          handleServiceError('[budget-ledger] Failed to detach transactions on master delete', txError);
        }
        const { error: delError } = await this.client
          .from(BUDGET_TABLE)
          .delete()
          .in('id', allIds)
          .eq('user_id', scopedUserId);
        if (delError) {
          handleServiceError('[budget-ledger] Failed to delete master budget tree', delError);
        }
      }
      return;
    }

    // Suppression d'un sous-budget : restitue l'allocation au master.
    const master = budgets.find((b) => b.isMaster) ?? null;
    if (master) {
      const restored = Math.max(master.remaining + budget.amount, 0);
      await this.client
        .from(BUDGET_TABLE)
        .update({ remaining: restored, updated_at: new Date().toISOString() })
        .eq('id', master.id)
        .eq('user_id', scopedUserId);
    }

    await this.client.from('transactions').update({ budget_id: null }).eq('budget_id', id).eq('user_id', scopedUserId);

    const { error } = await this.client.from(BUDGET_TABLE).delete().eq('id', id).eq('user_id', scopedUserId);
    if (error) handleServiceError('[budget-ledger] Failed to delete budget', error);
  }

  /**
   * Trouve le budget correspondant à une catégorie (sous-budget uniquement).
   */
  matchBudgetForCategory(category: TransactionCategory, budgets: BudgetEntity[]): BudgetEntity | null {
    return budgets.find((b) => !b.isMaster && b.category === category) ?? null;
  }

  /**
   * Construit l'arbre budgets + consommation à partir des transactions.
   */
  buildDashboard(budgets: BudgetEntity[], transactions: Transaction[]): BudgetDashboard {
    const budgetSpend = new Map<string, number>();
    const categorySpend = new Map<TransactionCategory, number>();

    for (const tx of transactions) {
      const type = tx.type ?? 'expense';
      if (type === 'income' || type === 'transfer') continue;
      const amount = tx.amount;
      if (tx.budgetId) {
        budgetSpend.set(tx.budgetId, (budgetSpend.get(tx.budgetId) ?? 0) + amount);
      } else {
        categorySpend.set(tx.category, (categorySpend.get(tx.category) ?? 0) + amount);
      }
    }

    const usageMap = new Map<string, BudgetWithUsage>();
    const roots: BudgetWithUsage[] = [];

    // Première passe : calcul sous-budgets
    for (const budget of budgets) {
      if (budget.isMaster) continue;
      const fallback = budget.category ? categorySpend.get(budget.category) ?? 0 : 0;
      if (budget.category && categorySpend.has(budget.category)) {
        categorySpend.set(budget.category, 0);
      }
      const spent = (budgetSpend.get(budget.id) ?? 0) + fallback;
      const remaining = Math.max(budget.amount - spent, 0);
      const progress = budget.amount > 0 ? spent / budget.amount : 0;
      usageMap.set(budget.id, { ...budget, spent, remaining, progress, children: [] });
    }

    // Seconde passe : master + rattachement des enfants
    for (const budget of budgets) {
      if (!budget.isMaster) continue;
      usageMap.set(budget.id, { ...budget, spent: 0, remaining: budget.remaining, progress: 0, children: [] });
    }

    // Construction de l'arbre
    for (const budget of usageMap.values()) {
      if (budget.parentId && usageMap.has(budget.parentId)) {
        usageMap.get(budget.parentId)!.children.push(budget);
      } else {
        roots.push(budget);
      }
    }

    const computeAllocated = (node: BudgetWithUsage): number => {
      return node.children.reduce((sum, child) => sum + child.amount + computeAllocated(child), 0);
    };

    // Ajuste le master : il reflète uniquement les enveloppes allouées (peut devenir négatif si sur-alloué).
    for (const budget of usageMap.values()) {
      if (budget.isMaster) {
        const allocated = computeAllocated(budget);
        budget.spent = allocated;
        budget.remaining = budget.amount - allocated;
        budget.progress = budget.amount > 0 ? allocated / budget.amount : 0;
      }
    }

    roots.sort((a, b) => {
      if (a.isMaster === b.isMaster) return 0;
      return a.isMaster ? -1 : 1;
    });

    const master = roots.find((b) => b.isMaster) ?? null;
    return { budgets: roots, master };
  }
}
