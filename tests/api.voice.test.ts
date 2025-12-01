import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeTranscription = "J'ai dépensé 25 euros au restaurant";
const fakeParsedExpense = {
  amount: 25,
  category: 'restaurant',
  description: 'Repas',
  expense_date: new Date().toISOString(),
  confidence_score: 0.95,
};

const fakeRecord = {
  ...fakeParsedExpense,
  raw_transcription: fakeTranscription,
  id: '00000000-0000-0000-0000-000000000000',
};

vi.mock('../lib/whisper', () => ({
  transcribeAudio: vi.fn(),
}));

vi.mock('../lib/groq', () => ({
  parseExpenseWithGroq: vi.fn(),
}));

const insertMock = vi.fn();
const fromMock = vi.fn();
const supabaseResponseRef = { current: { data: fakeRecord, error: null as { message: string } | null } };

vi.mock('../lib/supabase', () => ({
  getServerSupabaseClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

import { transcribeAudio } from '../lib/whisper';
import { parseExpenseWithGroq } from '../lib/groq';
import { getServerSupabaseClient } from '../lib/supabase';
import { POST } from '../app/api/voice/route';

const buildRequest = (file?: File, contentType?: string) => {
  const form = new FormData();
  if (file) {
    form.append('audio', file);
  }
  const headers = new Headers();
  if (contentType) {
    headers.set('content-type', contentType);
  }
  return {
    headers,
    formData: async () => form,
  } as unknown as Request;
};

const mockFile = () => new File([new Blob(['audio'])], 'recording.webm', { type: 'audio/webm' });

describe('/api/voice', () => {
  const transcribeAudioMock = vi.mocked(transcribeAudio);
  const parseExpenseWithGroqMock = vi.mocked(parseExpenseWithGroq);
  const supabaseClientMock = vi.mocked(getServerSupabaseClient);

  beforeEach(() => {
    transcribeAudioMock.mockResolvedValue(fakeTranscription);
    parseExpenseWithGroqMock.mockResolvedValue({ ...fakeParsedExpense });
    supabaseResponseRef.current = { data: fakeRecord, error: null };
    supabaseClientMock.mockClear();

    insertMock.mockImplementation(() => ({
      select: () => ({
        single: async () => supabaseResponseRef.current,
      }),
    }));

    fromMock.mockReturnValue({ insert: insertMock });
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('returns 201 with expense and transcription', async () => {
    const req = buildRequest(mockFile());
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.transcription).toBe(fakeTranscription);
    expect(body.expense.amount).toBe(fakeParsedExpense.amount);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(supabaseClientMock).toHaveBeenCalled();
  });

  it('rejects when audio is missing', async () => {
    const req = buildRequest();
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/audio file is required/i);
  });

  it('rejects unsupported mime type', async () => {
    const file = new File([new Blob(['bad'])], 'bad.txt', { type: 'text/plain' });
    const req = buildRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it('bubbles Groq parsing errors as 422', async () => {
    parseExpenseWithGroqMock.mockRejectedValueOnce(new Error('Invalid JSON'));
    const req = buildRequest(mockFile());
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('Invalid JSON');
  });

  it('returns 500 when Supabase insert fails', async () => {
    supabaseResponseRef.current = { data: null, error: { message: 'DB down' } };
    const req = buildRequest(mockFile());
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toMatch(/Database insertion failed/);
  });
});
