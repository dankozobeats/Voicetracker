import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe an audio Blob using OpenAI Whisper.
 * Returns the transcription text.
 */
export async function transcribeAudio(file: Blob): Promise<string> {
  // The OpenAI Node SDK expects a file stream in many versions; here we pass the Blob as-is
  // Server runtime (Vercel) provides web-standard Request/FormData which accepts Blob.
  // In tests this function should be mocked.
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

  // Convert Blob to Buffer for Node-friendly SDK usage
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const resp = await openai.audio.transcriptions.create({
    file: buffer as any,
    model: 'whisper-1',
    language: 'fr',
  } as any);

  // @ts-ignore - response shape depends on SDK
  return resp.text ?? resp?.data?.text ?? '';
}
