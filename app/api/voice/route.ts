import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { createGroqTranscript, parseExpenseWithGroq } from '@/lib/groq';
import { getServerSupabaseClient } from '@/lib/supabase';
import { apiResponseSchema, expenseInsertSchema } from '@/lib/schemas';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4']);
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
const SHOULD_ENFORCE_RATE_LIMIT_INLINE = process.env.NODE_ENV === 'test';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ErrorPayload = {
  error: {
    message: string;
    details?: unknown;
  };
};

const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: extraHeaders });

const errorResponse = (message: string, status: number, details?: unknown, headers?: Record<string, string>) =>
  jsonResponse({ error: { message, details } } satisfies ErrorPayload, status, headers);

const toRateLimitHeaders = (limit: number, remaining: number, reset: number) => ({
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-remaining': String(Math.max(remaining, 0)),
  'x-ratelimit-reset': String(reset),
});

export async function POST(request: Request): Promise<Response> {
  let rateLimitHeaders: Record<string, string> | undefined;
  try {
    if (SHOULD_ENFORCE_RATE_LIMIT_INLINE) {
      const ip = getClientIp(request);
      const result = rateLimit(ip);
      rateLimitHeaders = toRateLimitHeaders(result.limit, result.remaining, result.reset);
      if (result.isLimited) {
        return errorResponse('Rate limit exceeded', 429, { remaining: 0, reset: result.reset }, rateLimitHeaders);
      }
    }

    const url = new URL(request.url);
    const requestedMode = url.searchParams.get('type');
    if (requestedMode && requestedMode.toLowerCase() === 'text') {
      return await handleTextSubmission(request, rateLimitHeaders);
    }

    return await handleAudioSubmission(request, rateLimitHeaders);
  } catch (error) {
    console.error('[api/voice] Unexpected server error', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(message, 500, undefined, rateLimitHeaders);
  }
}

type SubmissionMode = 'audio' | 'text';

async function handleAudioSubmission(request: Request, rateLimitHeaders?: Record<string, string>): Promise<Response> {
  const contentType = request.headers.get('content-type');

  if (!contentType || !contentType.includes('multipart/form-data')) {
    return errorResponse('Content-Type must be multipart/form-data', 400, undefined, rateLimitHeaders);
  }

  const formData = await request.formData();
  const audioEntries = formData.getAll('audio');

  if (audioEntries.length === 0) {
    return errorResponse('audio file is required', 400, undefined, rateLimitHeaders);
  }

  if (audioEntries.length > 1) {
    return errorResponse('only one audio file can be uploaded at a time', 400, undefined, rateLimitHeaders);
  }

  const audio = audioEntries[0];
  if (!(audio instanceof File)) {
    return errorResponse('audio entry must be a file', 400, undefined, rateLimitHeaders);
  }

  if (audio.size === 0) {
    return errorResponse('audio file is empty', 400, undefined, rateLimitHeaders);
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return errorResponse('audio file exceeds 5MB', 413, undefined, rateLimitHeaders);
  }

  const normalizedType = audio.type?.split(';')[0]?.toLowerCase();
  if (normalizedType && !ALLOWED_AUDIO_TYPES.has(normalizedType)) {
    return errorResponse(`unsupported audio format: ${normalizedType}`, 415, undefined, rateLimitHeaders);
  }

  let transcription: string;
  try {
    transcription = await createGroqTranscript(audio);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('empty transcription')) {
      return errorResponse('Transcription is empty', 422, undefined, rateLimitHeaders);
    }
    throw err;
  }

  return finalizeTranscription('audio', request, transcription, rateLimitHeaders);
}

async function handleTextSubmission(request: Request, rateLimitHeaders?: Record<string, string>): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse('Content-Type must be application/json', 400, undefined, rateLimitHeaders);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error('[api/voice] Failed to parse JSON body', error);
    return errorResponse('Invalid JSON payload', 400, undefined, rateLimitHeaders);
  }

  const extractedText =
    body && typeof body === 'object' && 'text' in body ? (body as { text?: unknown }).text : undefined;
  const text = typeof extractedText === 'string' ? extractedText.trim() : '';
  if (!text) {
    return errorResponse('text field is required', 400, undefined, rateLimitHeaders);
  }

  return finalizeTranscription('text', request, text, rateLimitHeaders);
}

async function finalizeTranscription(
  mode: SubmissionMode,
  request: Request,
  transcription: string,
  rateLimitHeaders?: Record<string, string>,
): Promise<Response> {
  const userId = resolveUserId(request);
  if (!userId) {
    return errorResponse('user_id is required for this operation', 401, undefined, rateLimitHeaders);
  }

  const normalizedTranscript = transcription.trim();
  if (!normalizedTranscript) {
    return errorResponse('Transcription is empty', 422, undefined, rateLimitHeaders);
  }

  let parsedExpense;
  try {
    parsedExpense = await parseExpenseWithGroq(normalizedTranscript);
  } catch (error) {
    console.error('[api/voice] Groq parsing failed', error);
    const message = error instanceof Error ? error.message : 'Unable to parse transcription';
    return errorResponse(message, 422, undefined, rateLimitHeaders);
  }

  let expense;
  try {
    expense = expenseInsertSchema.parse({
      ...parsedExpense,
      user_id: userId,
      raw_transcription: normalizedTranscript,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('Validation failed', 422, error.errors, rateLimitHeaders);
    }
    throw error;
  }

  let supabase;
  try {
    supabase = getServerSupabaseClient();
  } catch (error) {
    console.error('[api/voice] Supabase client init failed', error);
    return errorResponse('Server configuration invalid', 500, undefined, rateLimitHeaders);
  }

  const { data, error } = await supabase.from('expenses').insert([expense]).select().single();

  if (error) {
    console.error('[api/voice] Supabase insert failed', error);
    return errorResponse('Database insertion failed', 500, undefined, rateLimitHeaders);
  }

  const payload = apiResponseSchema.parse({
    mode,
    transcript: normalizedTranscript,
    extracted: data,
  });

  return NextResponse.json(payload, { status: 201, headers: rateLimitHeaders });
}

const resolveUserId = (request: Request): string | null => {
  const headerCandidate = request.headers.get('x-user-id') ?? request.headers.get('x-supabase-user-id');
  if (headerCandidate && UUID_REGEX.test(headerCandidate.trim())) {
    return headerCandidate.trim();
  }

  const fallback = process.env.SUPABASE_DEFAULT_USER_ID?.trim();
  if (fallback && UUID_REGEX.test(fallback)) {
    return fallback;
  }

  return null;
};
