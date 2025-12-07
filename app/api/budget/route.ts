import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import { BudgetService } from '@/lib/budget';
import { RecurringService } from '@/lib/recurring';
import { TransactionService } from '@/lib/transactions';

const budgetService = new BudgetService();
const recurringService = new RecurringService();
const transactionService = new TransactionService();

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

// -------------------------------------------
// Désactive toute mise en cache côté route handler pour refléter immédiatement les transactions/budgets
// -------------------------------------------
export const revalidate = 0;

/**
 * Retrieve budgets with usage and projections.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const [budgets, monthlyTotals, recurringRules] = await Promise.all([
      budgetService.computeBudgets(userId),
      transactionService.computeMonthlyTotals(userId),
      recurringService.listRules(userId),
    ]);
    const usage = budgetService.computeCategoryUsage(monthlyTotals, budgets);
    const projections = budgetService.computeProjection(usage);
    const currentMonth = monthlyTotals[0]?.month ?? new Date().toISOString().slice(0, 7);
    const fixedCharges = recurringService.computeMonthlyFixedChargesForMonth(recurringRules, currentMonth);
    const recurringIncome = recurringService.computeMonthlyRecurringIncomeForMonth(recurringRules, currentMonth);
    const income = (monthlyTotals[0]?.incomeTotal ?? 0) + recurringIncome;
    const expenses = monthlyTotals[0]?.expenseTotal ?? monthlyTotals[0]?.total ?? 0;
    const balance = income - expenses - fixedCharges;

    return json({
      budgets,
      usage,
      projections,
      balance: {
        month: currentMonth,
        income,
        expenses,
        fixedCharges,
        balance,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch budget data';
    return json({ error: message }, 400);
  }
}

/**
 * Create a new budget rule.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const payload = await request.json();
    const rule = await budgetService.createRule(payload, userId);
    return json({ rule }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create budget rule';
    return json({ error: message }, 400);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    const payload = await request.json();
    const rule = await budgetService.updateRule(id, payload, userId);
    return json({ rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update budget rule';
    return json({ error: message }, 400);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    await budgetService.deleteRule(id, userId);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete budget rule';
    return json({ error: message }, 400);
  }
}
