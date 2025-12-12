/**
 * Script autonome pour générer les transactions récurrentes.
 * Usage :
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/run-recurring.js [YYYY-MM]
 * - YYYY-MM optionnel : mois ciblé (défaut = mois courant en UTC)
 * - Idempotent : s'appuie sur metadata.recurringRuleId + period pour éviter les doublons.
 *
 * Idéal pour une exécution cron/PM2 sur un VPS.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUDGET_NAME = process.env.RECURRING_DEFAULT_BUDGET_NAME || 'Charges fixes';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const assertAscii = (value, label) => {
  if (/[^\x00-\x7f]/.test(value)) {
    throw new Error(`${label} contains non-ASCII characters (ex: quotes courbes ou ellipsis). Remplace par une valeur ASCII.`);
  }
};

try {
  assertAscii(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  assertAscii(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  assertAscii(DEFAULT_BUDGET_NAME, 'RECURRING_DEFAULT_BUDGET_NAME');
} catch (error) {
  console.error(`[recurring] Invalid env: ${error.message}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Helpers date (UTC midi pour éviter les décalages)
const toUtcMidday = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
const addMonthsUtc = (date, monthsToAdd, preferredDay) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const targetDay = preferredDay ?? date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month + monthsToAdd, 1, 12, 0, 0, 0));
  const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0, 0)).getUTCDate();
  candidate.setUTCDate(Math.min(targetDay, lastDay));
  return candidate;
};
const incrementCursor = (date, rule) => {
  const next = toUtcMidday(new Date(date));
  const preferredDay = rule.day_of_month ?? next.getUTCDate();
  switch (rule.cadence) {
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      if (rule.weekday !== null && rule.weekday !== undefined) {
        const diff = rule.weekday - next.getUTCDay();
        next.setUTCDate(next.getUTCDate() + diff);
      }
      return next;
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

const occurrencesForMonth = (rule, monthKey) => {
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

  const dates = [];
  while (cursor <= monthEnd && (!endDate || cursor <= endDate)) {
    dates.push(toUtcMidday(cursor).toISOString());
    cursor = incrementCursor(cursor, rule);
  }
  return dates;
};

const main = async () => {
  const targetMonth = process.argv[2] || new Date().toISOString().slice(0, 7);
  console.log(`[recurring] Running generation for month ${targetMonth}`);

  const { data: rules, error: ruleError } = await supabase
    .from('recurring_rules')
    .select(
      // Include payment_source to handle Floa deferral logic.
      'id, user_id, amount, category, description, direction, cadence, payment_source, day_of_month, weekday, start_date, end_date, active',
    )
    .eq('active', true);
  if (ruleError) {
    console.error('[recurring] Failed to fetch rules', ruleError);
    process.exit(1);
  }
  if (!rules?.length) {
    console.log('[recurring] No rules found, exiting.');
    return;
  }

  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, user_id, category, name, is_master, amount, remaining');
  if (budgetError) {
    console.warn('[recurring] Failed to fetch budgets, proceeding without budget linkage', budgetError);
  }
  const budgetByCategory = new Map();
  const budgetByName = new Map();
  const masterByUser = new Map();
  const childrenByUser = new Map();
  (budgets || []).forEach((b) => {
    if (b.is_master) {
      masterByUser.set(b.user_id, b);
      return;
    }
    const key = `${b.user_id}::${b.category}`;
    budgetByCategory.set(key, b.id);
    const nameKey = `${b.user_id}::${(b.name || '').toLowerCase()}`;
    budgetByName.set(nameKey, b.id);
    if (!childrenByUser.has(b.user_id)) childrenByUser.set(b.user_id, []);
    childrenByUser.get(b.user_id).push(b);
  });

  const previousMonthKey = (() => {
    const [y, m] = targetMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0, 0));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  const minRuleMonth = rules
    .map((r) => String(r.start_date ?? '').slice(0, 7))
    .filter((v) => /^\d{4}-\d{2}$/.test(v))
    .sort()[0];

  let insertedCount = 0;
  for (const rule of rules) {
    const dueDates = occurrencesForMonth(rule, targetMonth);
    if (!dueDates.length) continue;

    for (const dueDate of dueDates) {
      const metadata = {
        category: rule.category,
        recurringRuleId: rule.id,
        period: targetMonth,
      };

      const budgetKey = `${rule.user_id}::${rule.category}`;
      const budgetId =
        budgetByCategory.get(budgetKey) ??
        budgetByName.get(`${rule.user_id}::${DEFAULT_BUDGET_NAME.toLowerCase()}`) ??
        null;

      // Branch by payment source: SG = current month, Floa = deferred repayment next month.
      const paymentSource = rule.payment_source || 'sg';

      if (paymentSource === 'floa' && rule.direction !== 'income') {
        // Floa: skip current charge, create repayment next month.
        const repaymentDate = (() => {
          const dateObj = new Date(dueDate);
          const anchor = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth() + 1, 1, 12, 0, 0, 0));
          return anchor.toISOString();
        })();
        const repaymentPeriod = repaymentDate.slice(0, 7);
        const repaymentMetadata = { ...metadata, floa_repayment: true, period: targetMonth };

        // Idempotency: skip if repayment already exists for this rule+period.
        const { data: existingRepayment, error: existsRepaymentError } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', rule.user_id)
          .eq('date', repaymentDate)
          .eq('floa_repayment', true)
          .contains('metadata', { recurringRuleId: rule.id, period: targetMonth })
          .limit(1);

        if (existsRepaymentError) {
          console.warn('[recurring] Skip Floa repayment due to lookup error', rule.id, existsRepaymentError);
          continue;
        }
        if (existingRepayment && existingRepayment.length) {
          console.log(`[recurring] Floa repayment already generated for rule ${rule.id} period ${targetMonth}`);
          continue;
        }

        const repaymentPayload = {
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
          metadata: repaymentMetadata,
          budget_id: budgetId,
          payment_source: 'sg',
          floa_repayment: true,
        };

        const { error: repaymentInsertError } = await supabase.from('transactions').insert(repaymentPayload);
        if (repaymentInsertError) {
          console.error('[recurring] Insert Floa repayment failed for rule', rule.id, repaymentInsertError);
        } else {
          insertedCount += 1;
          console.log(
            `[recurring] Inserted Floa repayment for rule ${rule.id} date ${repaymentDate} budget ${budgetId ?? 'none'}`,
          );
        }

        continue; // Skip SG insertion for Floa rules.
      }

      // SG path (default)
      // Idempotence : saute si déjà généré pour cette règle+période.
      const { data: existing, error: existsError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('date', dueDate)
        .contains('metadata', { recurringRuleId: rule.id, period: targetMonth })
        .limit(1);

      if (existsError) {
        console.warn('[recurring] Skip rule due to lookup error', rule.id, existsError);
        continue;
      }
      if (existing && existing.length) {
        console.log(`[recurring] Already generated for rule ${rule.id} period ${targetMonth}`);
        continue;
      }

      const payload = {
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
      };

      const { error: insertError } = await supabase.from('transactions').insert(payload);
      if (insertError) {
        console.error('[recurring] Insert failed for rule', rule.id, insertError);
      } else {
        insertedCount += 1;
        console.log(`[recurring] Inserted transaction for rule ${rule.id} date ${dueDate} budget ${budgetId ?? 'none'}`);
      }
    }
  }

  // Carry-over découvert : si master < allocation, on ajoute une charge au début du mois ciblé.
  const canCarryOver = minRuleMonth ? previousMonthKey >= minRuleMonth : true;
  if (canCarryOver) {
    for (const [userId, master] of masterByUser.entries()) {
    const children = childrenByUser.get(userId) ?? [];
    const allocated = children.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const computedRemaining = Number(master.amount || 0) - allocated;
    const dbRemaining = Number.isFinite(Number(master.remaining)) ? Number(master.remaining) : computedRemaining;
    const remaining = Math.min(dbRemaining, computedRemaining);
    if (remaining >= 0) continue;

    const carryAmount = Math.abs(remaining);
    const carryDate = `${targetMonth}-01T12:00:00.000Z`;
    const existingCarry = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('date', carryDate)
      .contains('metadata', { carryoverFrom: previousMonthKey, period: targetMonth })
      .limit(1);

    if (existingCarry.error) {
      console.warn('[recurring] Skip carry-over lookup error', existingCarry.error);
      continue;
    }
    if (existingCarry.data && existingCarry.data.length) {
      console.log(`[recurring] Carry-over already recorded for user ${userId} period ${targetMonth}`);
      continue;
    }

    const budgetId =
      budgetByName.get(`${userId}::${DEFAULT_BUDGET_NAME.toLowerCase()}`) ??
      budgetByCategory.get(`${userId}::autre`) ??
      null;

    const payload = {
      user_id: userId,
      amount: carryAmount,
      type: 'expense',
      account: null,
      settlement_date: null,
      category_id: null,
      description: `Rattrapage découvert ${previousMonthKey}`,
      merchant: null,
      date: carryDate,
      ai_raw: 'recurring_job_carryover',
      metadata: { carryoverFrom: previousMonthKey, period: targetMonth },
      budget_id: budgetId,
    };

    const { error: carryInsertError } = await supabase.from('transactions').insert(payload);
    if (carryInsertError) {
      console.error('[recurring] Insert carry-over failed for user', userId, carryInsertError);
    } else {
      insertedCount += 1;
      console.log(
        `[recurring] Inserted carry-over ${carryAmount} for user ${userId} period ${targetMonth} budget ${
          budgetId ?? 'none'
        }`,
      );
    }
  }
  }

  console.log(`[recurring] Done. Inserted ${insertedCount} transactions for ${targetMonth}.`);
};

main().catch((error) => {
  console.error('[recurring] Unexpected error', error);
  process.exit(1);
});
