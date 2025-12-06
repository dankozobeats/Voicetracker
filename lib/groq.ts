import Groq from 'groq-sdk';
import { Buffer } from 'node:buffer';

import { groqExpenseSchema, GroqExpense } from '@/lib/schemas';
import { ExpenseSchema } from '@/lib/types/Expense';

// Fail fast if the API key is missing to avoid silent runtime errors.
if (!process.env.GROQ_API_KEY) {
  throw new Error('Missing GROQ_API_KEY in environment.');
}

// Singleton Groq client used across transcription and chat calls.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Chosen chat model; override via env when needed.
export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL ?? 'llama-3.1-8b-instant';

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
