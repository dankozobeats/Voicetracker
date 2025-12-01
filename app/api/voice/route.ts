import { ZodError } from 'zod';

import { transcribeAudio } from '@/lib/whisper';
import { parseExpenseWithGroq } from '@/lib/groq';
import { getServerSupabaseClient } from '@/lib/supabase';
import { apiResponseSchema, expenseInsertSchema } from '@/lib/schemas';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4']);
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB hard limit
const SHOULD_ENFORCE_RATE_LIMIT_INLINE = process.env.NODE_ENV === 'test';

type ErrorPayload = {
  error: {
    message: string;
    details?: unknown;
  };
};

const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });

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

    const contentType = request.headers.get('content-type');
    
    // Handle direct audio blob upload
    if (contentType && contentType.startsWith('audio/')) {
      const audioBuffer = await request.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: contentType });
      
      if (audioBuffer.byteLength === 0) {
        return errorResponse('audio file is empty', 400, undefined, rateLimitHeaders);
      }

      if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
        return errorResponse('audio file exceeds 5MB', 413, undefined, rateLimitHeaders);
      }

      const normalizedType = contentType.split(';')[0]?.toLowerCase();
      if (!ALLOWED_AUDIO_TYPES.has(normalizedType)) {
        return errorResponse(`unsupported audio format: ${normalizedType}`, 415, undefined, rateLimitHeaders);
      }

      return processAudio(audioBlob, rateLimitHeaders);
    }

    // Handle multipart/form-data upload
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return errorResponse('Content-Type must be multipart/form-data or audio/*', 400, undefined, rateLimitHeaders);
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

    return processAudio(audio, rateLimitHeaders);
  } catch (error) {
    console.error('[api/voice] Unexpected server error', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(message, 500, undefined, rateLimitHeaders);
  }
}

async function processAudio(audio: Blob, rateLimitHeaders?: Record<string, string>): Promise<Response> {
  let transcription: string;
  try {
    transcription = await transcribeAudio(audio);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('empty transcription')) {
      return errorResponse('Transcription is empty', 422, undefined, rateLimitHeaders);
    }
    throw err;
  }

  if (!transcription?.trim()) {
    return errorResponse('Transcription is empty', 422, undefined, rateLimitHeaders);
  }

  let parsedExpense;
  try {
    parsedExpense = await parseExpenseWithGroq(transcription);
  } catch (error) {
    console.error('[api/voice] Groq parsing failed', error);
    const message = error instanceof Error ? error.message : 'Unable to parse transcription';
    return errorResponse(message, 422, undefined, rateLimitHeaders);
  }

  let expense;
  try {
    expense = expenseInsertSchema.parse({
      ...parsedExpense,
      raw_transcription: transcription,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('Validation failed', 422, error.errors, rateLimitHeaders);
    }
    throw error;
  }

  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase.from('expenses').insert([expense]).select().single();

  if (error) {
    console.error('[api/voice] Supabase insert failed', error);
    return errorResponse('Database insertion failed', 500, undefined, rateLimitHeaders);
  }

  const payload = apiResponseSchema.parse({ expense: data, transcription });
  return jsonResponse(payload, 201, rateLimitHeaders);
}
