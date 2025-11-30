import { NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';
import { parseExpenseWithGroq } from '@/lib/groq';
import { getSupabaseClient } from '@/lib/supabase';
import { expenseSchema, ExpenseInput } from '@/lib/schemas/expense';

/**
 * POST /api/voice
 * - Accepts multipart/form-data with `audio` file
 * - Transcribes audio (Whisper)
 * - Parses transcription to structured expense (Groq)
 * - Validates with Zod
 * - Inserts into Supabase `expenses` table
 * - Returns { expense, transcription }
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('audio') as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: 'audio file is required' }), { status: 400 });
    }

    // 1. Transcribe
    const transcription = await transcribeAudio(file);

    // 2. Parse
    const parsed = await parseExpenseWithGroq(transcription);

    // If the Groq returned a stringified JSON, try to parse it
    let parsedObj: any = parsed;
    if (typeof parsed === 'string') {
      try {
        parsedObj = JSON.parse(parsed);
      } catch (e) {
        // keep as-is — will be validated below and fail if incompatible
      }
    }

    // 3. Merge transcription into parsed object
    const candidate: any = {
      ...parsedObj,
      raw_transcription: transcription,
    };

    // 4. Validate
    const expense = expenseSchema.parse(candidate) as ExpenseInput;

    // 5. Insert into Supabase
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('expenses').insert([expense]).select().single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ expense: data, transcription }), { status: 201 });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
