const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';

/**
 * Transcribes an audio Blob with Whisper and returns plain text.
 * The OpenAI REST API is used directly to keep the payload small and predictable.
 */
export async function transcribeAudio(file: Blob): Promise<string> {
  if (!(file instanceof Blob)) {
    throw new Error('A valid audio blob is required for transcription');
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_WHISPER_MODEL?.trim() || DEFAULT_MODEL;

  const audioBuffer = await file.arrayBuffer();
  const blob = new Blob([audioBuffer], {
    type: file.type || 'audio/webm',
  });

  const form = new FormData();
  form.append('file', new File([blob], 'recording.webm', { type: blob.type }));
  form.append('model', model);
  form.append('language', 'fr');

  const response = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper transcription failed: ${errorText}`);
  }

  const payload = await response.json();
  if (typeof payload?.text !== 'string') {
    throw new Error('Whisper returned an unexpected payload');
  }

  const transcription = payload.text.trim();
  if (!transcription) {
    throw new Error('Whisper returned an empty transcription');
  }

  return transcription;
}
