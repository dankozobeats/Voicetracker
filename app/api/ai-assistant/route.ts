import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

const DEFAULT_AI_BASE_URL = 'https://ai.automationpro.cloud';
const assistantSchema = z.object({
  message: z.string().trim().min(1, 'Le message est requis'),
  userId: z.string().trim().min(1).optional(),
});

const errorResponse = (message: string, status = 500, details?: unknown) =>
  NextResponse.json({ ok: false, error: { message, details } }, { status });

const successResponse = (data: unknown) => NextResponse.json({ ok: true, data });

export async function POST(request: Request) {
  try {
    const payload = assistantSchema.parse(await request.json());
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return errorResponse('AI_API_KEY n’est pas défini', 500);
    }

    const baseUrl = (process.env.AI_API_URL ?? DEFAULT_AI_BASE_URL).replace(/\/+$/, '');
    const chatEndpoint = `${baseUrl}/chat`;
    const userId = payload.userId?.trim() || process.env.AI_DEFAULT_USER_ID || 'voicetrack-user';

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ userId, message: payload.message }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return errorResponse(
        'L’assistant distant a répondu une erreur',
        response.status,
        result ?? response.statusText,
      );
    }

    return successResponse(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse('Payload invalide', 400, error.errors);
    }
    console.error('[AI_ASSISTANT]', error);
    return errorResponse('Une erreur est survenue lors de l’appel à l’assistant', 500);
  }
}
