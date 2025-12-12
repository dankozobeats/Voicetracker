import Groq from 'groq-sdk';
import type { ChatCompletion, CompletionCreateParams } from 'groq-sdk/resources/chat/completions';
import { Buffer } from 'node:buffer';

import {
  groqExpenseSchema,
  type GroqExpense,
  safeParse,
  transactionParsedLLMSchema,
  type TransactionParsedLLM,
} from '@/lib/schemas';
import { ExpenseSchema } from '@/lib/types/Expense';

/* ============================================================================
   🔐 Sécurité : fail fast si la clé API manque
============================================================================ */
if (!process.env.GROQ_API_KEY) {
  throw new Error('Missing GROQ_API_KEY in environment.');
}

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* ============================================================================
   🎯 Sélection du modèle Groq
   - Le script Python définit GROQ_CHAT_MODEL automatiquement → on l’utilise
   - Modèles fallback actualisés : seul le modèle versatile est garanti aujourd’hui
============================================================================ */

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const configuredModel = process.env.GROQ_CHAT_MODEL?.trim();
const CHAT_MODELS_TO_TRY = [
  ...(configuredModel ? [configuredModel] : []),
  DEFAULT_MODEL,
];

// Export public du modèle sélectionné
export const CHAT_MODEL = CHAT_MODELS_TO_TRY[0];

/* ============================================================================
   🧠 Détection propre des erreurs "modèle indisponible"
============================================================================ */
function isModelUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('model_decommissioned') ||
    message.includes('model_not_found') ||
    message.includes('does not exist') ||
    message.includes('do not have access')
  );
}

/* ============================================================================
   🤖 Wrapper avec fallback :
   Essaie tous les modèles autorisés avant de throw l’erreur
============================================================================ */
type ChatCompletionPayload = Omit<CompletionCreateParams, 'model'>;

async function createChatCompletionWithFallback(payload: ChatCompletionPayload): Promise<ChatCompletion> {
  for (const model of CHAT_MODELS_TO_TRY) {
    try {
      console.log(`[GROQ] Trying model: ${model}`);
      return await groq.chat.completions.create({ ...payload, model }) as ChatCompletion;
    } catch (error) {
      if (isModelUnavailableError(error)) {
        console.warn(`[GROQ] Model unavailable: ${model}, trying fallback…`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`❌ Aucun modèle Groq valide disponible. Vérifie GROQ_CHAT_MODEL et https://console.groq.com/docs/deprecations`);
}

/* ============================================================================
   🎙️ Transcription audio Whisper
============================================================================ */
export async function createGroqTranscript(audio: Blob): Promise<string> {
  if (!(audio instanceof Blob)) throw new Error('A valid audio blob is required');

  const bufferedAudio = Buffer.from(await audio.arrayBuffer());
  if (bufferedAudio.length === 0) throw new Error('Audio blob is empty');

  const file = new File([bufferedAudio], audio instanceof File ? audio.name : 'audio.webm', {
    type: (audio as File).type || 'audio/webm',
  });

  const result = await groq.audio.transcriptions.create({
    model: 'whisper-large-v3',
    file,
  });

  const text = result?.text?.trim();
  if (!text) throw new Error('Groq Whisper returned an empty transcription');

  return text;
}

export async function transcribeAudio(
  buffer: Buffer,
  mimeType = 'audio/webm',
  filename = 'audio.webm',
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const file = new File([buffer], filename, { type: mimeType });
  return createGroqTranscript(file);
}

/* ============================================================================
   🧾 Extraction JSON — Dépenses
============================================================================ */
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
- Pas de texte autour
- Pas de markdown
- UNIQUEMENT un JSON valide
`;

const allowedCategories = 'restaurant,courses,transport,loisirs,santé,shopping,autre';

export async function parseExpenseWithGroq(transcription: string): Promise<GroqExpense> {
  const sanitized = transcription?.trim();
  if (!sanitized) throw new Error('Transcription is empty');

  const prompt = `Transcription: ${JSON.stringify(sanitized)}

Contraintes :
- amount: > 0
- category: [${allowedCategories}]
- description: max 200 chars
- date: ISO 8601`;

  const completion = await createChatCompletionWithFallback({
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Groq returned an empty response');

  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  const parsed = JSON.parse(cleaned);
  const validated = ExpenseSchema.parse(parsed);

  return groqExpenseSchema.parse({
    amount: validated.amount,
    category: validated.category,
    description: validated.description,
    expense_date: validated.date,
  });
}

/* ============================================================================
   🔍 Extraction JSON — Transactions
============================================================================ */
export async function extractTransaction(text: string): Promise<TransactionParsedLLM> {
  const sanitized = text?.trim();
  if (!sanitized) throw new Error('Transcription is empty');

  const systemPrompt = `You are a transaction extractor. Return ONLY a JSON object with:
{
  "type": "income" | "expense" | "transfer",
  "amount": number,
  "date": string,
  "description": string | null,
  "category_id": string | null,
  "merchant": string | null,
  "ai_confidence": number | null
}`;

  const completion = await createChatCompletionWithFallback({
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sanitized },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Groq returned an empty response');

  const parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
  const validated = safeParse(transactionParsedLLMSchema, parsed);

  if (!validated.success) throw validated.error;
  return validated.data;
}
