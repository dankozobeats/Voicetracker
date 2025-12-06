import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '../app/api/voice/route';
import { createGroqTranscript, parseExpenseWithGroq } from '../lib/groq';
import { resetRateLimitStore } from '../lib/rateLimit';

const BOUNDARY = '----testboundary';

const fakeTranscription = "J'ai dépensé 25 euros au restaurant";
const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

const fakeParsedExpense = {
  amount: 25,
  category: 'restaurant' as const,
  description: 'Repas',
  expense_date: '2025-01-01T00:00:00.000Z',
  confidence_score: 0.95,
};
const fakeRecord = {
  id: '00000000-0000-0000-0000-000000000000',
  user_id: TEST_USER_ID,
  ...fakeParsedExpense,
  raw_transcription: fakeTranscription,
};

type SupabaseResponse = {
  data: typeof fakeRecord | null;
  error: { message: string } | null;
};

let supabaseResponseRef: SupabaseResponse = { data: fakeRecord, error: null };

vi.mock('../lib/groq', () => ({
  createGroqTranscript: vi.fn(async () => fakeTranscription),
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

const buildRequest = async (file?: File, url = 'http://localhost/api/voice') => {
  const formData = new FormData();
  if (file) {
    formData.append('audio', file);
  }
  const request = new Request(url, {
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

const buildTextRequest = (text?: string) =>
  new Request('http://localhost/api/voice?type=text', {
    method: 'POST',
    body: JSON.stringify({ text }),
    headers: {
      'content-type': 'application/json',
    },
  });

const createGroqTranscriptMock = vi.mocked(createGroqTranscript);
const parseExpenseWithGroqMock = vi.mocked(parseExpenseWithGroq);

describe('/api/voice', () => {
  beforeEach(() => {
    resetRateLimitStore();
    supabaseResponseRef = { data: fakeRecord, error: null };
    createGroqTranscriptMock.mockReset();
    parseExpenseWithGroqMock.mockReset();
    createGroqTranscriptMock.mockResolvedValue(fakeTranscription);
    parseExpenseWithGroqMock.mockResolvedValue(fakeParsedExpense);
    process.env.SUPABASE_DEFAULT_USER_ID = TEST_USER_ID;
  });

  // WHY: successful flow should persist the expense and echo the transcription.
  it('returns 201 with audio mode payload', async () => {
    const res = await POST(await buildRequest(mockFile()));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.mode).toBe('audio');
    expect(body.transcript).toBe(fakeTranscription);
    expect(body.extracted.raw_transcription).toBe(fakeTranscription);
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

  it('supports manual text submissions', async () => {
    const request = buildTextRequest(fakeTranscription);
    const res = await POST(request);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.mode).toBe('text');
    expect(body.transcript).toBe(fakeTranscription);
    expect(body.extracted.raw_transcription).toBe(fakeTranscription);
  });

  it('rejects missing manual text', async () => {
    const request = buildTextRequest('   ');
    const res = await POST(request);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/text field is required/i);
  });
});
