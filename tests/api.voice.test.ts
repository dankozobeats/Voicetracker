import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '../app/api/voice/route';
import { transcribeAudio } from '../lib/whisper';
import { parseExpenseWithGroq } from '../lib/groq';

const BOUNDARY = '----testboundary';

const fakeTranscription = "J'ai dépensé 25 euros au restaurant";
const fakeParsedExpense = {
  amount: 25,
  category: 'restaurant' as const,
  description: 'Repas',
  expense_date: '2025-01-01T00:00:00.000Z',
  confidence_score: 0.95,
};
const fakeRecord = {
  id: '00000000-0000-0000-0000-000000000000',
  ...fakeParsedExpense,
  raw_transcription: fakeTranscription,
};

type SupabaseResponse = {
  data: typeof fakeRecord | null;
  error: { message: string } | null;
};

let supabaseResponseRef: SupabaseResponse = { data: fakeRecord, error: null };

vi.mock('../lib/whisper', () => ({
  transcribeAudio: vi.fn(async () => fakeTranscription),
}));

vi.mock('../lib/groq', () => ({
  parseExpenseWithGroq: vi.fn(async () => fakeParsedExpense),
}));

vi.mock('../lib/supabase', () => ({
  getServerSupabaseClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => supabaseResponseRef,
        }),
      }),
    }),
  }),
}));

const mockFile = (type = 'audio/webm', size = 1024) => new File([new Uint8Array(size).fill(97)], 'recording.webm', { type });

const buildRequest = async (file?: File) => {
  const formData = new FormData();
  if (file) {
    formData.append('audio', file);
  }
  const request = new Request('http://localhost/api/voice', {
    method: 'POST',
    body: formData,
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    },
  });

  Object.defineProperty(request, 'formData', {
    value: async () => formData,
  });

  return request;
};

const transcribeAudioMock = vi.mocked(transcribeAudio);
const parseExpenseWithGroqMock = vi.mocked(parseExpenseWithGroq);

describe('/api/voice', () => {
  beforeEach(() => {
    supabaseResponseRef = { data: fakeRecord, error: null };
    transcribeAudioMock.mockReset();
    parseExpenseWithGroqMock.mockReset();
    transcribeAudioMock.mockResolvedValue(fakeTranscription);
    parseExpenseWithGroqMock.mockResolvedValue(fakeParsedExpense);
  });

  // WHY: successful flow should persist the expense and echo the transcription.
  it('returns 201 with expense and transcription', async () => {
    const res = await POST(await buildRequest(mockFile()));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.transcription).toBe(fakeTranscription);
    expect(body.expense.raw_transcription).toBe(fakeTranscription);
  });

  // WHY: requests without an audio part must be rejected to match validation guards.
  it('returns 400 when audio file is missing', async () => {
    const res = await POST(await buildRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/audio file is required/i);
  });

  // WHY: enforcing the ALLOWED_AUDIO_TYPES set prevents unsupported codecs from running through Whisper.
  it('returns 415 for unsupported mime types', async () => {
    const res = await POST(await buildRequest(mockFile('text/plain')));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.message).toMatch(/unsupported audio format/i);
  });

  // WHY: Groq/Zod failures must bubble as 422 to surface parsing issues to clients.
  it('returns 422 when parsing transcription fails', async () => {
    parseExpenseWithGroqMock.mockRejectedValueOnce(new Error('LLM parse failed'));
    const res = await POST(await buildRequest(mockFile()));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('LLM parse failed');
  });

  // WHY: Supabase errors should produce a 500 so clients retry later instead of assuming success.
  it('returns 500 when Supabase insert fails', async () => {
    supabaseResponseRef = { data: null, error: { message: 'Database down' } };
    const res = await POST(await buildRequest(mockFile()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toMatch(/Database insertion failed/i);
  });
});
