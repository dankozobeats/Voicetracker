import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

import {
  RECURRING_LOOKAHEAD_MONTHS,
  type RecurringInstance,
  type RecurringMonthSummary,
  type RecurringRule,
} from '@/models/recurring';
import { parseRecurringRule } from '@/lib/validation';
import { applyUserFilter, handleServiceError, resolveUserId } from '@/lib/utils';
import { getServerSupabaseClient } from '@/lib/supabase';
import { BudgetLedgerService } from '@/lib/budget';

const TABLE_NAME = 'recurring_rules';
const SELECT_FIELDS =
  'id, user_id, amount, category, description, direction, cadence, day_of_month, weekday, start_date, end_date, created_at, updated_at';

/**
 * Service handling recurring charges logic.
 */
export class RecurringService {
  private client = getServerSupabaseClient();

  /**
   * Normalize a date so it does not drift across months when converted to ISO (avoid timezone surprises).
   * We keep a noon UTC anchor to stay inside the intended calendar day.
   */
  private normalizeToUtcMidday(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
  }

  /**
   * Generate month keys (YYYY-MM) starting from current month for the lookahead window.
   */
  private buildMonthKeys(lookAheadMonths: number): string[] {
    const anchor = this.normalizeToUtcMidday(new Date());
    const start = this.addMonthsUtc(anchor, 1, 1); // Commence sur le mois suivant pour éviter de ré-imputer le mois courant
    const months: string[] = [];
    for (let i = 0; i < lookAheadMonths; i += 1) {
      const current = this.addMonthsUtc(start, i, 1);
      const monthKey = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push(monthKey);
    }
    return months;
  }

  /**
   * Add months in UTC while preserving the intended day as much as possible (clamped to month length).
   */
  private addMonthsUtc(date: Date, monthsToAdd: number, preferredDay?: number): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const targetDay = preferredDay ?? date.getUTCDate();
    const candidate = new Date(Date.UTC(year, month + monthsToAdd, 1, 12, 0, 0, 0));
    const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0, 0)).getUTCDate();
    candidate.setUTCDate(Math.min(targetDay, lastDay));
    return candidate;
  }

  /**
   * Map raw Supabase row to domain recurring rule.
   * @param row - database record
   * @returns - recurring rule
   */
  private mapRow(row: Record<string, unknown>): RecurringRule {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      amount: Number(row.amount),
      category: row.category as RecurringRule['category'],
      description: (row.description as string | null | undefined) ?? null,
      direction: (row.direction as RecurringRule['direction']) ?? 'expense',
      cadence: row.cadence as RecurringRule['cadence'],
      dayOfMonth: (row.day_of_month as number | null | undefined) ?? null,
      weekday: (row.weekday as number | null | undefined) ?? null,
      startDate: row.start_date as string,
      endDate: (row.end_date as string | null | undefined) ?? null,
      createdAt: row.created_at as string | undefined,
      updatedAt: row.updated_at as string | undefined,
    };
  }

  /**
   * List recurring rules for the scoped user.
   * @param userId - optional user override
   * @returns - recurring rules list
   */
  async listRules(userId?: string): Promise<RecurringRule[]> {
    const scopedUserId = resolveUserId(userId);
    const { data, error }: PostgrestResponse<Record<string, unknown>> = await applyUserFilter(
      this.client.from(TABLE_NAME).select(SELECT_FIELDS),
      scopedUserId,
    )
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      // Swallow missing table or empty dataset to avoid crashing the dashboard.
      console.warn('[recurring] Failed to fetch rules, returning empty list', error);
      return [];
    }

    return (data ?? []).map((row) => this.mapRow(row));
  }

  /**
   * Create a recurring rule.
   * @param payload - rule data
   * @param userId - optional user override
   * @returns - created recurring rule
   */
  async createRule(payload: unknown, userId?: string): Promise<RecurringRule> {
    const parsed = parseRecurringRule(payload);
    const scopedUserId = resolveUserId(parsed.userId ?? userId, { required: true });

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
      .from(TABLE_NAME)
      .insert({
        user_id: scopedUserId,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        direction: parsed.direction ?? 'expense',
        cadence: parsed.cadence,
        day_of_month: parsed.dayOfMonth,
        weekday: parsed.weekday,
        start_date: parsed.startDate,
        end_date: parsed.endDate,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[recurring] Failed to create rule', error);
    }

    return this.mapRow(data);
  }

  /**
   * Update an existing recurring rule.
   * @param id - rule id
   * @param payload - full payload for the rule
   * @param userId - optional user override
   */
  async updateRule(id: string, payload: unknown, userId?: string): Promise<RecurringRule> {
    const parsed = parseRecurringRule(payload);
    const scopedUserId = resolveUserId(parsed.userId ?? userId, { required: true });

    const { data, error }: PostgrestSingleResponse<Record<string, unknown>> = await this.client
      .from(TABLE_NAME)
      .update({
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        direction: parsed.direction ?? 'expense',
        cadence: parsed.cadence,
        day_of_month: parsed.dayOfMonth,
        weekday: parsed.weekday,
        start_date: parsed.startDate,
        end_date: parsed.endDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', scopedUserId)
      .select(SELECT_FIELDS)
      .single();

    if (error || !data) {
      handleServiceError('[recurring] Failed to update rule', error);
    }

    return this.mapRow(data);
  }

  /**
   * Delete a recurring rule permanently.
   * @param id - rule id
   * @param userId - optional user override
   */
  async deleteRule(id: string, userId?: string): Promise<void> {
    const scopedUserId = resolveUserId(userId, { required: true });
    const { error } = await this.client.from(TABLE_NAME).delete().eq('id', id).eq('user_id', scopedUserId);
    if (error) {
      handleServiceError('[recurring] Failed to delete rule', error);
    }
  }

  /**
   * Generate upcoming instances for the next N periods to preview cash flow impact.
   * Defaults to two years ahead to give enough runway on the budget page.
   * @param rules - recurring rules
   * @param lookAheadMonths - number of months to project
   * @returns - list of upcoming instances
   */
  generateUpcomingInstances(rules: RecurringRule[], lookAheadMonths = RECURRING_LOOKAHEAD_MONTHS): RecurringInstance[] {
    const instances: RecurringInstance[] = [];
    const now = this.normalizeToUtcMidday(new Date());
    const horizon = this.normalizeToUtcMidday(new Date(now));
    horizon.setMonth(horizon.getMonth() + lookAheadMonths);

    for (const rule of rules) {
      let cursor = this.normalizeToUtcMidday(new Date(rule.startDate));
      const endDate = rule.endDate ? this.normalizeToUtcMidday(new Date(rule.endDate)) : null;

      // Align cursor to current period start.
      if (cursor < now) {
        cursor = this.alignCursorToNextOccurrence(cursor, now, rule);
      }

      if (endDate && cursor > endDate) {
        continue;
      }

      while (cursor <= horizon && (!endDate || cursor <= endDate)) {
        instances.push({
          ruleId: rule.id,
          dueDate: this.normalizeToUtcMidday(cursor).toISOString(),
          amount: rule.amount,
          category: rule.category,
          description: rule.description,
          direction: rule.direction,
          kind: 'recurring',
        });
        cursor = this.incrementCursor(cursor, rule);
      }
    }

    return instances;
  }

  /**
   * Sum total amount for generated instances.
   * @param instances - generated recurring charges
   * @returns - numeric total
   */
  computeTotalFixedCharges(instances: RecurringInstance[]): number {
    return instances.reduce((sum, instance) => {
      if (instance.direction === 'income') return sum;
      return sum + instance.amount;
    }, 0);
  }

  /**
   * Sum fixed charges that fall within a target month.
   * @param instances - generated recurring instances
   * @param monthKey - ISO month (YYYY-MM), defaults to current month
   * @returns - total amount due for the month
   */
  computeMonthlyFixedCharges(instances: RecurringInstance[], monthKey?: string): number {
    const targetMonth = monthKey ?? new Date().toISOString().slice(0, 7);
    return instances.reduce((sum, instance) => {
      if (instance.direction === 'income') return sum;
      return instance.dueDate.slice(0, 7) === targetMonth ? sum + instance.amount : sum;
    }, 0);
  }

  /**
   * Calcule les charges fixes pour un mois donné en incluant toutes les occurrences du mois (même passées).
   * @param rules - règles récurrentes (déjà filtrées par utilisateur)
   * @param monthKey - mois ciblé au format YYYY-MM
   * @returns - total des charges fixes du mois
   */
  computeMonthlyFixedChargesForMonth(rules: RecurringRule[], monthKey: string): number {
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0)); // dernier jour du mois

    let total = 0;

    for (const rule of rules) {
      // Ignore les règles de type revenu pour le calcul des charges fixes
      if (rule.direction === 'income') continue;

      let cursor = this.normalizeToUtcMidday(new Date(rule.startDate));
      const endDate = rule.endDate ? this.normalizeToUtcMidday(new Date(rule.endDate)) : null;

      // Ignore si la règle commence après la fin du mois.
      if (cursor > monthEnd) continue;

      // Avance le curseur jusqu'à entrer dans le mois ciblé (sans l'aligner sur "now").
      while (cursor < monthStart) {
        cursor = this.incrementCursor(cursor, rule);
        if (endDate && cursor > endDate) break;
      }
      if (endDate && cursor > endDate) continue;

      // Additionne toutes les occurrences du mois (même celles déjà passées).
      while (cursor <= monthEnd && (!endDate || cursor <= endDate)) {
        total += rule.amount;
        cursor = this.incrementCursor(cursor, rule);
      }
    }

    return total;
  }

  /**
   * Calcule les revenus récurrents (ex: salaire) pour un mois donné.
   * @param rules - règles récurrentes (déjà filtrées par utilisateur)
   * @param monthKey - mois ciblé au format YYYY-MM
   * @returns - total des revenus récurrents du mois
   */
  computeMonthlyRecurringIncomeForMonth(rules: RecurringRule[], monthKey: string): number {
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));

    let total = 0;

    for (const rule of rules) {
      if (rule.direction !== 'income') continue;
      let cursor = this.normalizeToUtcMidday(new Date(rule.startDate));
      const endDate = rule.endDate ? this.normalizeToUtcMidday(new Date(rule.endDate)) : null;
      if (cursor > monthEnd) continue;
      while (cursor < monthStart) {
        cursor = this.incrementCursor(cursor, rule);
        if (endDate && cursor > endDate) break;
      }
      if (endDate && cursor > endDate) continue;
      while (cursor <= monthEnd && (!endDate || cursor <= endDate)) {
        total += rule.amount;
        cursor = this.incrementCursor(cursor, rule);
      }
    }

    return total;
  }

  /**
   * Fetch the current overdraft to recover based on the master budget.
   * It mirrors the carry-over script logic: if master.remaining is negative, we carry it forward.
   */
  private async computeStartingOverdraft(userId?: string): Promise<number> {
    const ledger = new BudgetLedgerService(this.client);
    const budgets = await ledger.listForUser(userId);
    const master = budgets.find((b) => b.isMaster) ?? null;
    if (!master) return 0;

    const allocated = budgets.filter((b) => b.parentId === master.id).reduce((sum, b) => sum + b.amount, 0);
    const computedRemaining = master.amount - allocated;
    const dbRemaining = Number.isFinite(Number(master.remaining)) ? Number(master.remaining) : computedRemaining;
    const remaining = Math.min(dbRemaining, computedRemaining);
    return Math.max(0, -remaining);
  }

  /**
   * Round currency values to 2 decimals.
   */
  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Generate upcoming instances with a synthetic carry-over line per month to track overdraft catch-up.
   * The carry-over amount is recalculated each month based on remaining overdraft, remaining months,
   * and the room left after fixed charges and recurring income.
   */
  async generateUpcomingWithCarryover(
    rules: RecurringRule[],
    userId?: string,
    lookAheadMonths = RECURRING_LOOKAHEAD_MONTHS,
  ): Promise<{ instances: RecurringInstance[]; monthSummaries: RecurringMonthSummary[] }> {
    const baseInstances = this.generateUpcomingInstances(rules, lookAheadMonths);
    const monthKeys = this.buildMonthKeys(lookAheadMonths);
    const startingOverdraft = await this.computeStartingOverdraft(userId);

    const monthSummaries: RecurringMonthSummary[] = [];
    const carryovers: RecurringInstance[] = [];
    let overdraftRemaining = startingOverdraft;

    for (let idx = 0; idx < monthKeys.length; idx += 1) {
      const month = monthKeys[idx];
      const expenses = baseInstances
        .filter((instance) => instance.direction !== 'income' && instance.dueDate.slice(0, 7) === month)
        .reduce((sum, instance) => sum + instance.amount, 0);
      const income = baseInstances
        .filter((instance) => instance.direction === 'income' && instance.dueDate.slice(0, 7) === month)
        .reduce((sum, instance) => sum + instance.amount, 0);

      // Priorité : on rembourse le découvert en premier avec le revenu du mois (jusqu'à épuisement du revenu).
      const carryoverAmount = overdraftRemaining > 0 ? this.roundCurrency(Math.min(overdraftRemaining, income)) : 0;

      if (carryoverAmount > 0) {
        carryovers.push({
          ruleId: `carryover-${month}`,
          dueDate: `${month}-01T12:00:00.000Z`,
          amount: carryoverAmount,
          category: 'autre',
          description: 'Rattrapage découvert',
          direction: 'expense',
          kind: 'carryover',
        });
      }

      // Met à jour le découvert restant pour le mois suivant :
      // Nouvel overdraft = ancien overdraft + charges - revenus (paiement en priorité sur le découvert)
      // Cette formule équivaut à : payer le découvert jusqu'à hauteur du revenu, puis payer les charges avec le reste.
      overdraftRemaining = this.roundCurrency(Math.max(overdraftRemaining + expenses - income, 0));

      monthSummaries.push({
        month,
        expenses: this.roundCurrency(expenses),
        income: this.roundCurrency(income),
        carryover: carryoverAmount,
        totalWithCarryover: this.roundCurrency(expenses + carryoverAmount),
        overdraftRemaining,
      });
    }

    return { instances: [...baseInstances, ...carryovers], monthSummaries };
  }

  /**
   * Move a cursor to the next occurrence that is not in the past.
   * @param cursor - starting date
   * @param now - reference date
   * @param rule - recurring rule
   * @returns - aligned cursor
   */
  private alignCursorToNextOccurrence(cursor: Date, now: Date, rule: RecurringRule): Date {
    const aligned = this.normalizeToUtcMidday(new Date(cursor));

    while (aligned < now) {
      aligned.setTime(this.incrementCursor(aligned, rule).getTime());
    }

    return aligned;
  }

  /**
   * Increment cursor based on cadence definition.
   * @param date - current date pointer
   * @param rule - recurring rule
   * @returns - next date pointer
   */
  private incrementCursor(date: Date, rule: RecurringRule): Date {
    const next = this.normalizeToUtcMidday(new Date(date));
    const preferredDay = rule.dayOfMonth ?? next.getUTCDate();
    switch (rule.cadence) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        return this.addMonthsUtc(next, 1, preferredDay);
      case 'quarterly':
        return this.addMonthsUtc(next, 3, preferredDay);
      case 'yearly':
        return this.addMonthsUtc(next, 12, preferredDay);
      default:
        break;
    }

    if (rule.weekday !== null && rule.weekday !== undefined && rule.cadence === 'weekly') {
      const diff = rule.weekday - next.getDay();
      next.setDate(next.getDate() + diff);
    }

    return next;
  }
}
