import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

import type { BudgetProjection, BudgetRule, BudgetUsage } from '@/models/budget';
import type { MonthlyTotal } from '@/models/transaction';
import { parseBudgetRule } from '@/lib/validation';
import { applyUserFilter, handleServiceError, resolveUserId } from '@/lib/utils';
import { getServerSupabaseClient } from '@/lib/supabase';

const TABLE_NAME = 'budget_rules';
const SELECT_FIELDS =
  'id, user_id, category, monthly_limit, alert_threshold, start_date, end_date, created_at, updated_at';

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
