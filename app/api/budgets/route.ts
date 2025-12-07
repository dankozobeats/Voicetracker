// -------------------------------------------
// Route handler /api/budgets : liste et création de budgets hiérarchiques
// -------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import { BudgetLedgerService } from '@/lib/budget';
import { TransactionService } from '@/lib/transactions';

// Forcer les données fraîches (aucune mise en cache pour le dashboard budget)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const budgetLedger = new BudgetLedgerService();
const transactionService = new TransactionService();

// Helper JSON standardisé
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * GET /api/budgets : retourne master + sous-budgets avec progression.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const [budgets, transactions] = await Promise.all([
      budgetLedger.listForUser(userId),
      transactionService.list({}, userId),
    ]);

    const dashboard = budgetLedger.buildDashboard(budgets, transactions);
    return json({ budgets: dashboard.budgets, master: dashboard.master });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list budgets';
    return json({ error: message }, 400);
  }
}

/**
 * POST /api/budgets : crée un budget (master ou enfant) puis renvoie l'état mis à jour.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const payload = await request.json();

    // Coercition simple pour sécuriser le type attendu
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

    const budget = await budgetLedger.createBudget(budgetPayload, userId);

    const [budgets, transactions] = await Promise.all([
      budgetLedger.listForUser(userId),
      transactionService.list({}, userId),
    ]);
    const dashboard = budgetLedger.buildDashboard(budgets, transactions);

    return json({ budget, budgets: dashboard.budgets, master: dashboard.master }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create budget';
    return json({ error: message }, 400);
  }
}
