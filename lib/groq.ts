/**
 * parseExpenseWithGroq
 * - Sends transcription text to Groq (or any LLM service configured) and returns a parsed JSON object.
 * - The implementation uses a simple fetch to `process.env.GROQ_API_URL` and is intended to be mocked in tests.
 */
export async function parseExpenseWithGroq(transcription: string): Promise<unknown> {
  const url = process.env.GROQ_API_URL;
  const key = process.env.GROQ_API_KEY;

  if (!url || !key) {
    throw new Error('GROQ_API_URL or GROQ_API_KEY not set');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: transcription,
      // service-specific shape; keep minimal so tests can mock
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq parse failed: ${txt}`);
  }

  const json = await res.json();
  // Expect the LLM to return a JSON-parsable string or structured object
  return json;
}
