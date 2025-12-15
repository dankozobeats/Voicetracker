import { Buffer } from 'node:buffer';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { extractTransaction, transcribeAudio } from '@/lib/groq';
import { transactionInsertSchema, transactionParsedLLMSchema } from '@/lib/schemas';
import { BudgetLedgerService } from '@/lib/budget';
import type { TransactionCategory } from '@/models/transaction';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4']);
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
const SHOULD_ENFORCE_RATE_LIMIT_INLINE = process.env.NODE_ENV === 'test';

const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: extraHeaders });

const successResponse = (data: unknown, status = 200, headers?: Record<string, string>) =>
  jsonResponse({ ok: true, data }, status, headers);

const errorResponse = (
  code: string,
  message: string,
  status: number,
  details?: unknown,
  headers?: Record<string, string>,
) => jsonResponse({ ok: false, error: { code, message, details } }, status, headers);

const toRateLimitHeaders = (limit: number, remaining: number, reset: number) => ({
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-remaining': String(Math.max(remaining, 0)),
  'x-ratelimit-reset': String(reset),
});

type ParsedTransaction = z.infer<typeof transactionParsedLLMSchema>;

/**
 * Best-effort heuristic to classify incomes when the LLM omits the type.
 */
const inferType = (type: ParsedTransaction['type'] | undefined, rawText: string, description?: string | null) => {
  if (type) return type;
  const haystack = `${rawText} ${description ?? ''}`.toLowerCase();
  const incomeKeywords = ['salaire', 'paie', 'paye', 'payroll', 'salary', 'income', 'revenu', 'prime', 'bonus'];
  return incomeKeywords.some((word) => haystack.includes(word)) ? 'income' : 'expense';
};

const budgetLedger = new BudgetLedgerService();

/**
 * Heuristic pour déterminer une catégorie textuelle (alignée avec les budgets) à partir du texte ou du merchant.
 */
const inferCategory = (rawText: string, description?: string | null): TransactionCategory => {
  const haystack = `${rawText} ${description ?? ''}`.toLowerCase();
  if (haystack.match(/mc ?do|quick|burger king|kfc|restaurant|resto|food|pizza/)) return 'restaurant';
  if (haystack.match(/carrefour|leclerc|intermarch|courses|supermarch|épicerie|biocoop|aldi|lidl|monoprix/)) return 'courses';
  if (haystack.match(/uber|bolt|sncf|ratp|tcl|transport|taxi|bus|train|tram|essence|station/)) return 'transport';
  if (haystack.match(/cinéma|cine|netflix|spotify|loisir|concert|jeu|jeux|culture/)) return 'loisirs';
  if (haystack.match(/pharmacie|médecin|dentiste|santé|medical|opticien/)) return 'santé';
  if (haystack.match(/amazon|shopping|magasin|vetement|vêtement|mode/)) return 'shopping';
  return 'autre';
};

/**
 * Normalize parsed data (LLM or manual) and insert into Supabase.
 */
async function insertTransaction(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  tx: ParsedTransaction,
  raw: string,
  userId: string,
  headers?: Record<string, string>,
) {
  // -------------------------------------------
  // Normalise la date : si absente ou aberrante (trop ancienne), on force à aujourd'hui
  // -------------------------------------------
  const today = new Date();
  const parsedDate = tx.date ? new Date(tx.date) : today;
  const isValidDate = !Number.isNaN(parsedDate.getTime());
  const isPastYear = parsedDate.getFullYear() < today.getFullYear(); // protège contre une année précédente (ex: 2024 quand on est en 2025)
  const isTooOld = parsedDate.getFullYear() < today.getFullYear() - 1; // garde max 1 an de recul par défaut
  const normalizedDate = isValidDate && !isPastYear && !isTooOld ? parsedDate.toISOString() : today.toISOString();

  const parsed = transactionInsertSchema.parse({
    ...tx,
    date: normalizedDate,
    user_id: userId,
    raw_transcription: raw,
  });

  const transactionPayload = {
    user_id: parsed.user_id,
    type: parsed.type,
    amount: parsed.amount,
    category_id: parsed.category_id ?? null,
    description: parsed.description ?? null,
    merchant: parsed.merchant ?? null,
    date: parsed.date ?? normalizedDate,
    ai_confidence: parsed.ai_confidence ?? null,
    ai_raw: parsed.raw_transcription,
    ai_source: 'voice',
    recurring_id: null,
    metadata: {},
  };

  const metadataCategory: TransactionCategory =
    transactionPayload.type === 'income'
      ? 'salaire'
      : inferCategory(raw, parsed.description ?? parsed.merchant ?? null);
  transactionPayload.metadata = { category: metadataCategory };

  // -------------------------------------------
  // Tente d'associer un budget (catégorie textuelle) pour déduire l'enveloppe.
  // -------------------------------------------
  let budgetAlert: {
    budgetId: string;
    budgetName: string;
    progress: number;
    amount: number;
    spent: number;
    level: 50 | 75 | 100;
  } | null = null;

  try {
    if (transactionPayload.type === 'expense') {
      const budgets = await budgetLedger.listForUser(userId);
      const matched = metadataCategory ? budgetLedger.matchBudgetForCategory(metadataCategory, budgets) : null;
      if (matched) {
        transactionPayload.budget_id = matched.id;
      }

      const { data: txRows, error: txError } = await supabase
        .from('transactions')
        .select('amount, type, deleted_at')
        .eq('budget_id', matched?.id ?? null)
        .eq('user_id', userId);

      if (!txError && matched) {
        const spent = (txRows ?? []).reduce((sum, row) => {
          const t = (row.type as ParsedTransaction['type'] | undefined) ?? 'expense';
          if (t === 'income' || t === 'transfer' || row.deleted_at) return sum;
          const amt = Number(row.amount);
          return Number.isFinite(amt) ? sum + amt : sum;
        }, parsed.amount);

        const progress = matched.amount > 0 ? spent / matched.amount : 0;
        const thresholds: (50 | 75 | 100)[] = [50, 75, 100];
        const hit = thresholds.reduce<50 | 75 | 100 | null>((acc, thr) => {
          if (progress >= thr / 100) return thr;
          return acc;
        }, null);
        if (hit !== null) {
          budgetAlert = {
            budgetId: matched.id,
            budgetName: matched.name,
            progress,
            amount: matched.amount,
            spent,
            level: hit,
          };
        }
      }
    }
  } catch (error) {
    console.warn('[voice] budget linkage failed, fallback to neutral insert', error);
  }

  const { data, error } = await supabase.from('transactions').insert([transactionPayload]).select().single();

  if (error) {
    console.error('VOICE_API_ERROR supabase', error);
    return errorResponse('DB_INSERT_FAILED', 'Database insertion failed', 500, error, headers);
  }

  if (transactionPayload.type === 'income' && metadataCategory === 'salaire') {
    await budgetLedger.syncMasterToSalary(userId);
  }

  return successResponse({ ...data, budgetAlert }, 201, headers);
}

export async function POST(request: Request): Promise<Response> {
  let rateLimitHeaders: Record<string, string> | undefined;
  try {
    const cookieStore = cookies();
    // The Supabase route handler client inspects `context.cookies()` and expects a store
    // with a working `.get` method; passing the helper directly caused
    // "this.context.cookies(...).get is not a function" in production on Vercel.
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('VOICE_API_ERROR session', sessionError);
      return errorResponse('SESSION_ERROR', 'Unable to fetch session', 500, sessionError, rateLimitHeaders);
    }

    if (!session?.user?.id) {
      return errorResponse('UNAUTHENTICATED', 'Authentication required', 401, undefined, rateLimitHeaders);
    }

    if (SHOULD_ENFORCE_RATE_LIMIT_INLINE) {
      const ip = getClientIp(request);
      const result = rateLimit(ip);
      rateLimitHeaders = toRateLimitHeaders(result.limit, result.remaining, result.reset);
      if (result.isLimited) {
        return errorResponse('RATE_LIMITED', 'Rate limit exceeded', 429, { remaining: 0, reset: result.reset }, rateLimitHeaders);
      }
    }

    const url = new URL(request.url);
    const requestedMode = url.searchParams.get('type');

    const processTranscription = async (normalizedTranscript: string) => {
      let parsedLLM;
      try {
        parsedLLM = transactionParsedLLMSchema.parse(await extractTransaction(normalizedTranscript));
      } catch (error) {
        if (error instanceof ZodError) {
          return errorResponse('PARSE_VALIDATION_FAILED', 'Validation failed', 422, error.errors, rateLimitHeaders);
        }
        console.error('VOICE_API_ERROR parse', error);
        const message = error instanceof Error ? error.message : 'Unable to parse transcription';
        return errorResponse('PARSE_FAILED', message, 422, undefined, rateLimitHeaders);
      }

      const normalized = {
        ...parsedLLM,
        type: inferType(parsedLLM.type, normalizedTranscript, parsedLLM.description),
      };

      return insertTransaction(supabase, normalized, normalizedTranscript, session.user.id, rateLimitHeaders);
    };

    if (requestedMode && requestedMode.toLowerCase() === 'text') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        return errorResponse('INVALID_CONTENT_TYPE', 'Content-Type must be application/json', 400, undefined, rateLimitHeaders);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        console.error('VOICE_API_ERROR json', error);
        return errorResponse('INVALID_JSON', 'Invalid JSON payload', 400, undefined, rateLimitHeaders);
      }

      const manualTransactionSchema = transactionParsedLLMSchema.extend({
        date: transactionParsedLLMSchema.shape.date.optional(),
      });

      const manualCandidate = body && typeof body === 'object' && 'transaction' in body ? (body as { transaction?: unknown }).transaction : null;
      const manualParsed = manualCandidate ? manualTransactionSchema.safeParse(manualCandidate) : { success: false as const };
      if (manualParsed.success) {
        const normalized = {
          ...manualParsed.data,
          date: manualParsed.data.date ?? new Date().toISOString(),
          type: inferType(manualParsed.data.type, JSON.stringify(manualCandidate), manualParsed.data.description),
        };
        return insertTransaction(
          supabase,
          normalized as ParsedTransaction,
          JSON.stringify(manualCandidate),
          session.user.id,
          rateLimitHeaders,
        );
      }

      const extractedText =
        body && typeof body === 'object' && 'text' in body ? (body as { text?: unknown }).text : undefined;
      const text = typeof extractedText === 'string' ? extractedText.trim() : '';
      if (!text) {
        return errorResponse('MISSING_TEXT', 'text field is required', 400, undefined, rateLimitHeaders);
      }

      return processTranscription(text);
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return errorResponse('INVALID_CONTENT_TYPE', 'Content-Type must be multipart/form-data', 400, undefined, rateLimitHeaders);
    }

    const formData = await request.formData();
    const audioEntries = formData.getAll('audio');

    if (audioEntries.length === 0) {
      return errorResponse('MISSING_AUDIO', 'audio file is required', 400, undefined, rateLimitHeaders);
    }

    if (audioEntries.length > 1) {
      return errorResponse('TOO_MANY_FILES', 'only one audio file can be uploaded at a time', 400, undefined, rateLimitHeaders);
    }

    const audio = audioEntries[0];
    if (!(audio instanceof File)) {
      return errorResponse('INVALID_AUDIO', 'audio entry must be a file', 400, undefined, rateLimitHeaders);
    }

    if (audio.size === 0) {
      return errorResponse('EMPTY_AUDIO', 'audio file is empty', 400, undefined, rateLimitHeaders);
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return errorResponse('AUDIO_TOO_LARGE', 'audio file exceeds 5MB', 413, undefined, rateLimitHeaders);
    }

    const normalizedType = audio.type?.split(';')[0]?.toLowerCase();
    if (normalizedType && !ALLOWED_AUDIO_TYPES.has(normalizedType)) {
      return errorResponse('UNSUPPORTED_AUDIO', `unsupported audio format: ${normalizedType}`, 415, undefined, rateLimitHeaders);
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer());

    let transcription: string;
    try {
      transcription = await transcribeAudio(audioBuffer, normalizedType || 'audio/webm', audio.name || 'audio.webm');
    } catch (error) {
      console.error('VOICE_API_ERROR transcription', error);
      const message = error instanceof Error ? error.message : 'Unable to transcribe audio';
      return errorResponse('TRANSCRIPTION_FAILED', message, 500, undefined, rateLimitHeaders);
    }

    const normalizedTranscript = transcription.trim();
    if (!normalizedTranscript) {
      return errorResponse('EMPTY_TRANSCRIPTION', 'Transcription is empty', 422, undefined, rateLimitHeaders);
    }

    return processTranscription(normalizedTranscript);
  } catch (error) {
    console.error('VOICE_API_ERROR unexpected', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse('UNEXPECTED', message, 500, undefined, rateLimitHeaders);
  }
}
