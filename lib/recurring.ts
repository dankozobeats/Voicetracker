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
  'id, user_id, amount, category, description, direction, cadence, day_of_month, weekday, start_date, end_date, payment_source, created_at, updated_at';
const FALLBACK_FIELDS =
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
   * Compute first day of next month anchored at noon UTC (used for Floa repayments).
   */
  private nextMonthAnchor(date: Date): Date {
    return this.addMonthsUtc(this.normalizeToUtcMidday(date), 1, 1);
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
      paymentSource: (row.payment_source as RecurringRule['paymentSource']) ?? 'sg',
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
    let query = applyUserFilter(this.client.from(TABLE_NAME).select(SELECT_FIELDS), scopedUserId)
      .order('created_at', { ascending: true })
      .limit(100);

    let { data, error }: PostgrestResponse<Record<string, unknown>> = await query;

    if (error) {
      console.warn('[recurring] Full select failed, trying fallback fields', error);
      const fallbackQuery = applyUserFilter(this.client.from(TABLE_NAME).select(FALLBACK_FIELDS), scopedUserId)
        .order('created_at', { ascending: true })
        .limit(100);
      const fallback = await fallbackQuery;
      data = fallback.data ?? [];
      if (fallback.error) {
        console.warn('[recurring] Fallback select failed, returning empty list', fallback.error);
        return [];
      }
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
        payment_source: parsed.paymentSource ?? 'sg',
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
        payment_source: parsed.paymentSource ?? 'sg',
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
    horizon.setMonth(horizon.getMonth() + lookAheadMonths + 1); // +1 to capture Floa repayments following horizon

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
        const occurrenceDate = this.normalizeToUtcMidday(cursor);
        if (rule.paymentSource === 'floa' && rule.direction === 'expense') {
          // Skip immediate charge, schedule repayment next month as SG.
          const repayDate = this.nextMonthAnchor(occurrenceDate);
          if (repayDate <= horizon) {
            const period = `${occurrenceDate.getUTCFullYear()}-${String(occurrenceDate.getUTCMonth() + 1).padStart(2, '0')}`;
            instances.push({
              ruleId: `${rule.id}-floa-${repayDate.toISOString()}`,
              dueDate: repayDate.toISOString(),
              amount: rule.amount,
              category: 'floa_bank',
              description: rule.description ? `Remboursement Floa – ${rule.description}` : 'Remboursement Floa',
              direction: 'expense',
              kind: 'recurring',
              metadata: { recurringRuleId: rule.id, period },
            });
          }
        } else {
          instances.push({
            ruleId: rule.id,
            dueDate: occurrenceDate.toISOString(),
            amount: rule.amount,
            category: rule.category,
            description: rule.description,
            direction: rule.direction,
            kind: 'recurring',
          });
        }
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
      // Ignore deferred Floa repayments for fixed charges tally.
      if (instance.category === 'floa_bank') return sum;
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
      // Ignore deferred Floa purchases and repayments from the fixed charges tally.
      if (instance.category === 'floa_bank') return sum;
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
      // Ignore les dépenses Floa (elles seront remboursées le mois suivant)
      if (rule.paymentSource === 'floa') continue;

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
   * Fetch existing Floa repayment transactions over the horizon to avoid double counting
   * and to include repayments originating from ad-hoc user transactions.
   */
  private async fetchFloaRepaymentTransactions(monthKeys: string[], userId?: string): Promise<RecurringInstance[]> {
    const scopedUserId = resolveUserId(userId);
    if (!monthKeys.length) return [];

    const start = `${monthKeys[0]}-01T00:00:00.000Z`;
    const [lastYear, lastMonth] = monthKeys[monthKeys.length - 1].split('-').map(Number);
    const endDate = new Date(Date.UTC(lastYear, lastMonth, 0, 23, 59, 59, 999)).toISOString();

    const { data, error } = await applyUserFilter(
      this.client
        .from('transactions')
        .select('id, amount, description, date, metadata')
        .eq('floa_repayment', true)
        .gte('date', start)
        .lte('date', endDate),
      scopedUserId,
    );

    if (error) {
      console.warn('[recurring] Failed to fetch Floa repayments, skipping tx inclusion', error);
      return [];
    }

    return (data ?? []).map((row) => ({
      ruleId: String(row.id),
      dueDate: String(row.date),
      amount: Number(row.amount),
      category: 'floa_bank',
      description: (row.description as string | null | undefined) ?? null,
      direction: 'expense',
      kind: 'recurring',
      metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? undefined,
    }));
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
    const floaRepaymentTx = await this.fetchFloaRepaymentTransactions(monthKeys, userId);

    // If a repayment transaction already exists for a recurring rule+period, skip the virtual instance to avoid double counting.
    const repaymentKeysFromTx = new Set(
      floaRepaymentTx
        .map((instance) => {
          const meta = instance.metadata as Record<string, unknown> | undefined;
          const key =
            meta && typeof meta.recurringRuleId === 'string' && typeof meta.period === 'string'
              ? `${meta.recurringRuleId}::${meta.period}`
              : null;
          return key;
        })
        .filter(Boolean) as string[],
    );

    const instances = [
      ...baseInstances.filter((instance) => {
        if (instance.category !== 'floa_bank') return true;
        const meta = instance.metadata as Record<string, unknown> | undefined;
        const key =
          meta && typeof meta.recurringRuleId === 'string' && typeof meta.period === 'string'
            ? `${meta.recurringRuleId}::${meta.period}`
            : null;
        return key ? !repaymentKeysFromTx.has(key) : true;
      }),
      ...floaRepaymentTx,
    ];

    const monthSummaries: RecurringMonthSummary[] = [];
    let overdraftRemaining = startingOverdraft;

    for (let idx = 0; idx < monthKeys.length; idx += 1) {
      const month = monthKeys[idx];
      const sgExpenses = instances
        .filter(
          (instance) =>
            instance.direction !== 'income' &&
            instance.dueDate.slice(0, 7) === month &&
            instance.category !== 'floa_bank',
        )
        .reduce((sum, instance) => sum + instance.amount, 0);
      const floaRepayments = instances
        .filter((instance) => instance.direction !== 'income' && instance.dueDate.slice(0, 7) === month && instance.category === 'floa_bank')
        .reduce((sum, instance) => sum + instance.amount, 0);
      const income = instances
        .filter((instance) => instance.direction === 'income' && instance.dueDate.slice(0, 7) === month)
        .reduce((sum, instance) => sum + instance.amount, 0);

      const solde = income - overdraftRemaining - sgExpenses - floaRepayments;
      const nextOverdraft = this.roundCurrency(Math.max(-solde, 0));

      // Build detailed items for the month.
      const monthItems: RecurringMonthSummary['items'] = [
        ...instances
          .filter(
            (instance) =>
              instance.dueDate.slice(0, 7) === month && instance.direction !== 'income' && instance.category !== 'floa_bank',
          )
          .map((instance) => ({
            type: 'sg_charge' as const,
            ruleId: instance.ruleId,
            amount: instance.amount,
            description: instance.description ?? instance.category,
          })),
        ...instances
          .filter((instance) => instance.dueDate.slice(0, 7) === month && instance.category === 'floa_bank')
          .map((instance) => ({
            type: 'floa_repayment' as const,
            ruleId: instance.ruleId,
            amount: instance.amount,
            description: instance.description ?? 'Remboursement Floa',
          })),
      ];
      if (overdraftRemaining > 0) {
        monthItems.push({
          type: 'overdraft',
          amount: overdraftRemaining,
          description: 'Découvert reporté',
        });
      }

      monthSummaries.push({
        month,
        expenses: this.roundCurrency(sgExpenses),
        income: this.roundCurrency(income),
        // carryover reused to surface floa repayments until UI is updated.
        carryover: this.roundCurrency(floaRepayments),
        // Charges fixes SG uniquement + éventuel rattrapage découvert (sans les remboursements Floa).
        totalWithCarryover: this.roundCurrency(sgExpenses + overdraftRemaining),
        overdraftRemaining: nextOverdraft,
        // Treasury-specific fields
        sgChargesTotal: this.roundCurrency(sgExpenses),
        floaRepaymentsTotal: this.roundCurrency(floaRepayments),
        overdraftIncoming: this.roundCurrency(overdraftRemaining),
        overdraftOutgoing: nextOverdraft,
        salary: this.roundCurrency(income),
        finalBalance: this.roundCurrency(solde),
        items: monthItems,
      });

      overdraftRemaining = nextOverdraft;
    }

    return { instances, monthSummaries };
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
