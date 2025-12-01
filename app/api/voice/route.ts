import { ZodError } from 'zod';

import { transcribeAudio } from '@/lib/whisper';
import { parseExpenseWithGroq } from '@/lib/groq';
import { getServerSupabaseClient } from '@/lib/supabase';
import { apiResponseSchema, expenseInsertSchema } from '@/lib/schemas';

const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4']);
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

type ErrorPayload = {
  error: {
    message: string;
    details?: unknown;
  };
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status: number, details?: unknown) =>
  jsonResponse({ error: { message, details } } satisfies ErrorPayload, status);

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type');
    if (contentType && !contentType.includes('multipart/form-data')) {
      return errorResponse('Content-Type must be multipart/form-data', 400);
    }

    const formData = await request.formData();
    const audioEntries = formData.getAll('audio');

    if (audioEntries.length === 0) {
      return errorResponse('audio file is required', 400);
    }

    if (audioEntries.length > 1) {
      return errorResponse('only one audio file can be uploaded at a time', 400);
    }

    const audio = audioEntries[0];
    if (!(audio instanceof File)) {
      return errorResponse('audio entry must be a file', 400);
    }

    if (audio.size === 0) {
      return errorResponse('audio file is empty', 400);
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return errorResponse('audio file exceeds 10MB', 413);
    }

    if (audio.type && !ALLOWED_AUDIO_TYPES.has(audio.type)) {
      return errorResponse(`unsupported audio format: ${audio.type}`, 415);
    }

    const transcription = await transcribeAudio(audio);

    let parsedExpense;
    try {
      parsedExpense = await parseExpenseWithGroq(transcription);
    } catch (error) {
      console.error('[api/voice] Groq parsing failed', error);
      const message = error instanceof Error ? error.message : 'Unable to parse transcription';
      return errorResponse(message, 422);
    }

    let expense;
    try {
      expense = expenseInsertSchema.parse({
        ...parsedExpense,
        raw_transcription: transcription,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse('Validation failed', 422, error.errors);
      }
      throw error;
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.from('expenses').insert([expense]).select().single();

    if (error) {
      console.error('[api/voice] Supabase insert failed', error);
      return errorResponse('Database insertion failed', 500);
    }

    const payload = apiResponseSchema.parse({ expense: data, transcription });
    return jsonResponse(payload, 201);
  } catch (error) {
    console.error('[api/voice] Unexpected server error', error);
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(message, 500);
  }
}
