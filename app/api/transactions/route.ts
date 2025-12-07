import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import type { TransactionFilters } from '@/models/transaction';
import { TransactionService } from '@/lib/transactions';
import { parseTransactionUpdate } from '@/lib/validation';

const transactionService = new TransactionService();

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * List transactions or monthly summaries.
 * Accepts optional query params: category, startDate, endDate, summary=monthly.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const params = request.nextUrl.searchParams;
    const filters: TransactionFilters = {
      category: (params.get('category') as TransactionFilters['category']) ?? undefined,
      startDate: params.get('startDate') ?? undefined,
      endDate: params.get('endDate') ?? undefined,
    };

    const transactions = await transactionService.list(filters, userId);

    if (params.get('summary') === 'monthly') {
      const monthlyTotals = await transactionService.computeMonthlyTotals(userId);
      return json({ transactions, monthlyTotals });
    }

    return json({ transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list transactions';
    return json({ error: message }, 400);
  }
}

/**
 * Create a transaction via non-vocal flow.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const payload = await request.json();
    const transaction = await transactionService.create({ ...payload, userId });
    return json({ transaction }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create transaction';
    return json({ error: message }, 400);
  }
}

/**
 * Update transaction fields (expects ?id=uuid in the query string).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const params = request.nextUrl.searchParams;
    const id = params.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    const payload = parseTransactionUpdate(await request.json());
    const transaction = await transactionService.update(id, payload, userId);
    return json({ transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update transaction';
    return json({ error: message }, 400);
  }
}

/**
 * Soft delete a transaction (expects ?id=uuid).
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    await transactionService.softDelete(id, userId);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete transaction';
    return json({ error: message }, 400);
  }
}
