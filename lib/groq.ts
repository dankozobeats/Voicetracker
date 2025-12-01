import { groqExpenseSchema, GroqExpense } from '@/lib/schemas';

const DEFAULT_SYSTEM_PROMPT = `Vous êtes un extracteur JSON strict.
Vous recevez la transcription textuelle (en français) d'une dépense.
Vous devez retourner uniquement un objet JSON, sans texte avant/après ni commentaires.`;

const allowedCategories = 'restaurant,courses,transport,loisirs,santé,shopping,autre';

/**
 * Calls the configured Groq endpoint with a strict prompt and validates the JSON it returns.
 */
export async function parseExpenseWithGroq(transcription: string): Promise<GroqExpense> {
  const key = process.env.GROQ_API_KEY;

  if (!key) throw new Error('GROQ_API_KEY must be set');

  const sanitizedInput = transcription?.trim();
  if (!sanitizedInput) {
    throw new Error('Transcription is empty and cannot be parsed');
  }

  const prompt = `
${DEFAULT_SYSTEM_PROMPT}

Transcription:
${JSON.stringify(sanitizedInput)}

Le JSON doit respecter ce schéma:
{
  "amount": nombre strictement positif (euros),
  "category": enum(${allowedCategories}),
  "description": chaîne optionnelle (<= 200 caractères),
  "expense_date": chaîne ISO 8601 (UTC si possible),
  "confidence_score": nombre entre 0 et 1 optionnel
}

RENVOIE UNIQUEMENT CE JSON.
`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Groq returned an empty response');
  }

  const content = data.choices[0].message.content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('Groq did not return valid JSON');
  }

  return groqExpenseSchema.parse(parsed);
}
