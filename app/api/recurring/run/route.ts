import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

// Lightweight port of scripts/run-recurring.js so we can trigger it from the UI for testing.
// Executes with the service role key (required).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const defaultBudgetName = process.env.RECURRING_DEFAULT_BUDGET_NAME || 'Charges fixes';

  if (!url || !serviceKey) {
    return json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 400);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const targetMonth =
    (await request.json().catch(() => ({ month: null }))).month ||
    request.nextUrl.searchParams.get('month') ||
    new Date().toISOString().slice(0, 7);

  const { data: rules, error: ruleError } = await supabase
    .from('recurring_rules')
    .select(
      'id, user_id, amount, category, description, direction, cadence, payment_source, day_of_month, weekday, start_date, end_date',
    );
  if (ruleError) return json({ error: 'Failed to fetch rules', details: ruleError }, 500);
  if (!rules?.length) return json({ inserted: 0, message: 'No rules found' });

  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, user_id, category, name, is_master, amount, remaining');
  if (budgetError) {
    // Continue without budget linkage.
    console.warn('[recurring-run] budgets fetch error', budgetError);
  }

  const budgetByCategory = new Map<string, string>();
  const budgetByName = new Map<string, string>();
  (budgets || []).forEach((b) => {
    if (b.is_master) return;
    budgetByCategory.set(`${b.user_id}::${b.category}`, b.id);
    budgetByName.set(`${b.user_id}::${(b.name || '').toLowerCase()}`, b.id);
  });

  const toUtcMidday = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
  const addMonthsUtc = (date: Date, monthsToAdd: number, preferredDay?: number | null) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const targetDay = preferredDay ?? date.getUTCDate();
    const candidate = new Date(Date.UTC(year, month + monthsToAdd, 1, 12, 0, 0, 0));
    const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0, 0)).getUTCDate();
    candidate.setUTCDate(Math.min(targetDay, lastDay));
    return candidate;
  };
  const incrementCursor = (date: Date, rule: any) => {
    const next = toUtcMidday(new Date(date));
    const preferredDay = rule.day_of_month ?? next.getUTCDate();
    switch (rule.cadence) {
      case 'weekly': {
        next.setUTCDate(next.getUTCDate() + 7);
        if (rule.weekday !== null && rule.weekday !== undefined) {
          const diff = rule.weekday - next.getUTCDay();
          next.setUTCDate(next.getUTCDate() + diff);
        }
        return next;
      }
      case 'monthly':
        return addMonthsUtc(next, 1, preferredDay);
      case 'quarterly':
        return addMonthsUtc(next, 3, preferredDay);
      case 'yearly':
        return addMonthsUtc(next, 12, preferredDay);
      default:
        return next;
    }
  };
  const occurrencesForMonth = (rule: any, monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));

    let cursor = toUtcMidday(new Date(rule.start_date));
    const endDate = rule.end_date ? toUtcMidday(new Date(rule.end_date)) : null;
    if (cursor > monthEnd) return [];

    while (cursor < monthStart) {
      cursor = incrementCursor(cursor, rule);
      if (endDate && cursor > endDate) return [];
    }
    if (endDate && cursor > endDate) return [];

    const dates: string[] = [];
    while (cursor <= monthEnd && (!endDate || cursor <= endDate)) {
      dates.push(toUtcMidday(cursor).toISOString());
      cursor = incrementCursor(cursor, rule);
    }
    return dates;
  };

  let inserted = 0;
  for (const rule of rules) {
    const dates = occurrencesForMonth(rule, targetMonth);
    for (const dueDate of dates) {
      const metadata = { category: rule.category, recurringRuleId: rule.id, period: targetMonth };
      const budgetId =
        budgetByCategory.get(`${rule.user_id}::${rule.category}`) ??
        budgetByName.get(`${rule.user_id}::${defaultBudgetName.toLowerCase()}`) ??
        null;
      const paymentSource = rule.payment_source || 'sg';

      if (paymentSource === 'floa' && rule.direction !== 'income') {
        const repaymentDate = (() => {
          const dateObj = new Date(dueDate);
          const anchor = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth() + 1, 1, 12, 0, 0, 0));
          return anchor.toISOString();
        })();

        const { data: existing, error: lookupError } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', rule.user_id)
          .eq('date', repaymentDate)
          .eq('floa_repayment', true)
          .contains('metadata', { recurringRuleId: rule.id, period: targetMonth })
          .limit(1);
        if (lookupError) {
          console.warn('[recurring-run] floa lookup failed', lookupError);
          continue;
        }
        if (existing && existing.length) continue;

        const { error: insertError } = await supabase.from('transactions').insert({
          user_id: rule.user_id,
          amount: Number(rule.amount),
          type: 'expense',
          account: null,
          settlement_date: null,
          category_id: null,
          description: rule.description ? `Remboursement Floa – ${rule.description}` : 'Remboursement Floa',
          merchant: null,
          date: repaymentDate,
          ai_raw: 'recurring_job',
          metadata: { ...metadata, floa_repayment: true },
          budget_id: budgetId,
          payment_source: 'sg',
          floa_repayment: true,
        });
        if (!insertError) inserted += 1;
        continue;
      }

      const { data: existing, error: lookupError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('date', dueDate)
        .contains('metadata', { recurringRuleId: rule.id, period: targetMonth })
        .limit(1);
      if (lookupError) {
        console.warn('[recurring-run] lookup failed', lookupError);
        continue;
      }
      if (existing && existing.length) continue;

      const { error: insertError } = await supabase.from('transactions').insert({
        user_id: rule.user_id,
        amount: Number(rule.amount),
        type: rule.direction === 'income' ? 'income' : 'expense',
        account: null,
        settlement_date: null,
        category_id: null,
        description: rule.description ?? null,
        merchant: null,
        date: dueDate,
        ai_raw: 'recurring_job',
        metadata,
        budget_id: budgetId,
        payment_source: paymentSource,
        floa_repayment: false,
      });
      if (!insertError) inserted += 1;
    }
  }

  return json({ inserted, month: targetMonth });
}
