// -------------------------------------------
// Route handler /api/budgets/[id] : update / delete budgets
// -------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import { BudgetLedgerService } from '@/lib/budget';
import { TransactionService } from '@/lib/transactions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const budgetLedger = new BudgetLedgerService();
const transactionService = new TransactionService();

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * PATCH /api/budgets/[id] : met à jour un budget et renvoie l'état recalculé.
 */
export async function PATCH(request: NextRequest, context: { params: { id: string } }): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const payload = await request.json();
    const budgetPayload = {
      name: String(payload.name ?? '').trim(),
      amount: Number(payload.amount ?? 0),
      isMaster: Boolean(payload.isMaster),
      parentId: payload.parentId ?? null,
      category: payload.category ?? null,
    };

    if (!budgetPayload.name || Number.isNaN(budgetPayload.amount)) {
      return json({ error: 'name and amount are required' }, 400);
    }

    const budget = await budgetLedger.updateBudget(context.params.id, budgetPayload, userId);

    const [budgets, transactions] = await Promise.all([
      budgetLedger.listForUser(userId),
      transactionService.list({}, userId),
    ]);
    const dashboard = budgetLedger.buildDashboard(budgets, transactions);

    return json({ budget, budgets: dashboard.budgets, master: dashboard.master });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update budget';
    return json({ error: message }, 400);
  }
}

/**
 * DELETE /api/budgets/[id] : supprime un sous-budget et restitue le montant au master.
 */
export async function DELETE(_request: NextRequest, context: { params: { id: string } }): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    await budgetLedger.deleteBudget(context.params.id, userId);

    const [budgets, transactions] = await Promise.all([
      budgetLedger.listForUser(userId),
      transactionService.list({}, userId),
    ]);
    const dashboard = budgetLedger.buildDashboard(budgets, transactions);

    return json({ success: true, budgets: dashboard.budgets, master: dashboard.master });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete budget';
    return json({ error: message }, 400);
  }
}
