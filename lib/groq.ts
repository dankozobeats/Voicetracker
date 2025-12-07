import Groq from 'groq-sdk';
import { Buffer } from 'node:buffer';

import {
  groqExpenseSchema,
  type GroqExpense,
  safeParse,
  transactionParsedLLMSchema,
  type TransactionParsedLLM,
} from '@/lib/schemas';
import { ExpenseSchema } from '@/lib/types/Expense';

// Fail fast if the API key is missing to avoid silent runtime errors.
if (!process.env.GROQ_API_KEY) {
  throw new Error('Missing GROQ_API_KEY in environment.');
}

// Singleton Groq client used across transcription and chat calls.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Chosen chat model; override via env when needed.
export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL ?? 'llama3-8b-8192';

const DEFAULT_SYSTEM_PROMPT = `
Tu es un extracteur de dépenses.
Tu dois renvoyer EXCLUSIVEMENT ce JSON :

{
  "amount": number,
  "category": string,
  "description": string,
  "date": string
}

RÈGLES STRICTES :
- Ne renvoie aucun autre champ (pas de confidence, score, tokens, etc.)
- Pas de texte autour
- Pas de markdown
- Pas de commentaires
- Retourne UNIQUEMENT un JSON valide.
`;

const allowedCategories = 'restaurant,courses,transport,loisirs,santé,shopping,autre';

export async function createGroqTranscript(audio: Blob): Promise<string> {
  if (!(audio instanceof Blob)) {
    throw new Error('A valid audio blob is required for transcription');
  }

  const bufferedAudio = Buffer.from(await audio.arrayBuffer());
  if (bufferedAudio.length === 0) {
    throw new Error('Audio blob is empty');
  }

  const name = audio instanceof File && audio.name ? audio.name : 'audio.webm';

  const mimeType = (audio as File)?.type || 'audio/webm';
  const fileForGroq = new File([bufferedAudio], name, { type: mimeType });

  const transcription = await groq.audio.transcriptions.create({
    model: 'whisper-large-v3',
    file: fileForGroq,
  }) as { text?: string };

  const text = transcription?.text?.trim();
  if (!text) {
    throw new Error('Groq Whisper returned an empty transcription');
  }

  return text;
}

/**
 * Calls the Groq Chat Completions endpoint and validates the returned JSON payload.
 */
export async function parseExpenseWithGroq(transcription: string): Promise<GroqExpense> {
  const sanitizedInput = transcription?.trim();
  if (!sanitizedInput) {
    throw new Error('Transcription is empty and cannot be parsed');
  }

  const prompt = `Transcription: ${JSON.stringify(sanitizedInput)}

Contraintes :
- amount: nombre strictement positif (en euros, nombre pur)
- category: doit appartenir à [${allowedCategories}]
- description: chaîne optionnelle (max 200 caractères)
- date: chaîne formatée ISO 8601 (UTC si possible)

Retourne uniquement un JSON valide.`;

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('model_decommissioned')) {
      throw new Error(
        `Groq model "${CHAT_MODEL}" is not available. Set GROQ_CHAT_MODEL to a supported model (see https://console.groq.com/docs/deprecations).`,
      );
    }
    throw error;
  }

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Groq returned an empty response');
  }

  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error('Groq did not return valid JSON');
  }

  const validated = ExpenseSchema.parse(parsed);

  return groqExpenseSchema.parse({
    amount: validated.amount,
    category: validated.category,
    description: validated.description,
    expense_date: validated.date,
  });
}

/**
 * Transcribe audio buffer with Groq Whisper (turbo variant).
 * @param buffer - raw audio bytes
 * @param mimeType - content type of the audio
 * @param filename - name used for the file sent to Groq
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType = 'audio/webm',
  filename = 'audio.webm',
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const file = new File([buffer], filename, { type: mimeType });
  const transcription = (await groq.audio.transcriptions.create({
    model: 'whisper-large-v3-turbo',
    file,
  })) as { text?: string };

  const text = transcription?.text?.trim();
  if (!text) {
    throw new Error('Groq Whisper returned an empty transcription');
  }

  return text;
}

/**
 * Extract structured transaction data from free-form text using Groq chat.
 * Wraps parsing with robust JSON validation to avoid malformed responses.
 * @param text - normalized transcription
 */
export async function extractTransaction(text: string): Promise<TransactionParsedLLM> {
  const sanitizedInput = text?.trim();
  if (!sanitizedInput) {
    throw new Error('Transcription is empty and cannot be parsed');
  }

  const prompt = `You are a transaction extractor. Return ONLY valid JSON with the following shape:
{
  "type": "income" | "expense" | "transfer",
  "amount": number,
  "date": string, // ISO 8601
  "description": string | null,
  "category_id": string | null,
  "merchant": string | null,
  "ai_confidence": number | null
}

Rules:
- No markdown, no code fences, no additional text.
- If unsure, set nullable fields to null.`;

  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: sanitizedInput },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Groq returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch (error) {
    throw new Error('Groq did not return valid JSON');
  }

  const validated = safeParse(transactionParsedLLMSchema, parsed);
  if (!validated.success) {
    throw validated.error;
  }

  return validated.data;
}
