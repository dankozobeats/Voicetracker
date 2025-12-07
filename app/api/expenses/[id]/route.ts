import { NextRequest, NextResponse } from 'next/server';

import { categories, groqExpenseSchema } from '@/lib/schemas';
import { getServerSupabaseClient } from '@/lib/supabase';

const jsonResponse = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function DELETE(_request: NextRequest, context: { params: { id: string } }): Promise<Response> {
  const { params } = context;
  const supabase = getServerSupabaseClient();
  const id = params?.id;
  if (!id) {
    return jsonResponse({ error: 'Missing expense id' }, 400);
  }

  const { error } = await supabase.from('expenses').delete().eq('id', id);

  if (error) {
    console.error('[api/expenses/:id] Delete failed', error);
    return jsonResponse({ error: 'Unable to delete expense' }, 500);
  }

  return jsonResponse({ ok: true });
}

type PatchPayload = Partial<Pick<ReturnType<typeof groqExpenseSchema.parse>, 'amount' | 'category' | 'description' | 'expense_date'>>;

const categorySet = new Set(categories);

const coercePatchPayload = async (request: Request): Promise<PatchPayload> => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid payload');
  }

  const out: PatchPayload = {};

  if ('amount' in body) {
    const parsed = Number((body as { amount?: unknown }).amount);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('amount must be a positive number');
    out.amount = parsed;
  }

  if ('category' in body) {
    const value = String((body as { category?: unknown }).category ?? '').trim();
    if (!categorySet.has(value as (typeof categories)[number])) {
      throw new Error(`category must be one of: ${categories.join(', ')}`);
    }
    out.category = value as (typeof categories)[number];
  }

  if ('description' in body) {
    const value = (body as { description?: unknown }).description;
    if (value === null || value === undefined) {
      out.description = undefined;
    } else {
      const text = String(value);
      if (text.length > 200) throw new Error('description must be <= 200 chars');
      out.description = text;
    }
  }

  if ('expense_date' in body) {
    const value = (body as { expense_date?: unknown }).expense_date;
    const iso = typeof value === 'string' ? new Date(value).toISOString() : null;
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      throw new Error('expense_date must be a valid date');
    }
    out.expense_date = iso;
  }

  if (Object.keys(out).length === 0) {
    throw new Error('No valid fields provided');
  }

  return out;
};

export async function PATCH(request: NextRequest, context: { params: { id: string } }): Promise<Response> {
  const { params } = context;
  const supabase = getServerSupabaseClient();
  const id = params?.id;
  if (!id) {
    return jsonResponse({ error: 'Missing expense id' }, 400);
  }

  let payload: PatchPayload;
  try {
    payload = await coercePatchPayload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid payload';
    return jsonResponse({ error: message }, 400);
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[api/expenses/:id] Patch failed', error);
    return jsonResponse({ error: 'Unable to update expense' }, 500);
  }

  return jsonResponse({ expense: data });
}
