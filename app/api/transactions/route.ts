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

    // 1️⃣ Toujours garantir un userId — même si pas de session
    const userId =
      session?.user?.id ||
      process.env.SUPABASE_DEFAULT_USER_ID ||
      (() => {
        console.warn("[API] No userId found, default fallback missing");
        return null;
      })();

    if (!userId) {
      return json({ transactions: [], error: "NO_USER_ID" }, 400);
    }

    const params = request.nextUrl.searchParams;
    const filters: TransactionFilters = {
      category: params.get('category') ?? undefined,
      startDate: params.get('startDate') ?? undefined,
      endDate: params.get('endDate') ?? undefined,
    };

    const transactions = await transactionService.list(filters, userId);

    if (params.get('summary') === 'monthly') {
      const monthlyTotals = await transactionService.computeMonthlyTotals(userId);
      return json({ transactions, monthlyTotals, userId });
    }

    return json({ transactions, userId });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to list transactions' }, 400);
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
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;

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
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;

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
    const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;

    const params = request.nextUrl.searchParams;
    if (params.get('all') === 'true') {
      await transactionService.deleteAll(userId);
      return json({ success: true });
    }

    let ids: string[] = [];

    // Support ?id=..., ?ids=[...] and bulk via JSON body { ids: [...] }
    const idParam = params.get('id');
    const idsParam = params.get('ids');
    if (idParam) {
      ids = [idParam];
    } else if (idsParam) {
      try {
        const parsed = JSON.parse(idsParam);
        if (Array.isArray(parsed)) {
          ids = parsed.map((val) => String(val)).filter(Boolean);
        }
      } catch (err) {
        console.error('[transactions] Failed to parse ids param', err);
        return json({ error: 'ids must be a JSON array' }, 400);
      }
    } else {
      const contentType = request.headers.get('content-type') ?? '';
      if (contentType.toLowerCase().includes('application/json')) {
        const body = await request.json().catch(() => null);
        if (body && Array.isArray(body.ids)) {
          ids = body.ids.map((val) => String(val)).filter(Boolean);
        }
      }
    }

    if (!ids.length) return json({ error: 'id or ids[] are required' }, 400);

    if (ids.length === 1) {
      await transactionService.softDelete(ids[0], userId);
    } else {
      await transactionService.softDeleteMany(ids, userId);
    }
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete transaction';
    return json({ error: message }, 400);
  }
}
