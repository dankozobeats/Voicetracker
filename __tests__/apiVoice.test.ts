import { Blob, File, FormData } from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/voice/route';

const mockTranscribe = vi.fn();
const mockExtract = vi.fn();

const mockInsertChain = () => {
  const chain: any = {};
  chain.insert = vi.fn().mockImplementation(() => chain);
  chain.select = vi.fn().mockImplementation(() => chain);
  chain.single = vi.fn();
  return chain;
};

const insertChain = mockInsertChain();
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
  },
  from: vi.fn(() => insertChain),
};

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => mockSupabase,
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock('@/lib/groq', () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribe(...args),
  extractTransaction: (...args: unknown[]) => mockExtract(...args),
}));

describe('/api/voice route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    insertChain.insert.mockImplementation(() => insertChain);
    insertChain.select.mockImplementation(() => insertChain);
    insertChain.single.mockResolvedValue({ data: null, error: null });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    mockSupabase.from.mockReturnValue(insertChain);
  });

  it('creates a transaction on success', async () => {
    const nowIso = new Date().toISOString();
    mockTranscribe.mockResolvedValue('Café 5 euros');
    mockExtract.mockResolvedValue({
      type: 'expense',
      amount: 5,
      date: nowIso,
      description: 'Café',
      category_id: null,
      merchant: null,
      ai_confidence: 0.9,
    });
    insertChain.single.mockResolvedValue({
      data: { id: 'tx-1', user_id: 'user-123', amount: 5, type: 'expense', date: nowIso },
      error: null,
    });

    const formData = new FormData();
    formData.append('audio', new File([new Blob(['audio'])], 'voice.webm', { type: 'audio/webm' }));

    const response = await POST(new Request('http://localhost/api/voice', { method: 'POST', body: formData as any }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.data.user_id).toBe('user-123');
    expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
  });

  it('fails when no audio is provided', async () => {
    const formData = new FormData();
    const response = await POST(new Request('http://localhost/api/voice', { method: 'POST', body: formData as any }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('MISSING_AUDIO');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('returns an error when Groq JSON is invalid', async () => {
    mockTranscribe.mockResolvedValue('test');
    mockExtract.mockRejectedValue(new Error('Groq did not return valid JSON'));

    const formData = new FormData();
    formData.append('audio', new File([new Blob(['audio'])], 'voice.webm', { type: 'audio/webm' }));

    const response = await POST(new Request('http://localhost/api/voice', { method: 'POST', body: formData as any }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('PARSE_FAILED');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('returns validation error when parsed data is invalid', async () => {
    mockTranscribe.mockResolvedValue('invalid payload');
    mockExtract.mockResolvedValue({
      type: 'expense',
      amount: 'oops',
      date: 'invalid',
      description: null,
      category_id: null,
      merchant: null,
      ai_confidence: null,
    });

    const formData = new FormData();
    formData.append('audio', new File([new Blob(['audio'])], 'voice.webm', { type: 'audio/webm' }));

    const response = await POST(new Request('http://localhost/api/voice', { method: 'POST', body: formData as any }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('PARSE_VALIDATION_FAILED');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});
