import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external modules
vi.mock('@/lib/whisper', () => ({
  transcribeAudio: vi.fn(async (file: any) => 'J\'ai dépensé 25 euros au restaurant'),
}));

vi.mock('@/lib/groq', () => ({
  parseExpenseWithGroq: vi.fn(async (text: string) => ({
    amount: 25,
    category: 'restaurant',
    description: 'Restaurant',
    expense_date: new Date().toISOString(),
    confidence_score: 0.95,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'uuid', amount: 25 }, error: null } ) }) }),
    }),
  }),
}));

import { POST } from '@/app/api/voice/route';

describe('/api/voice', () => {
  it('returns 201 with expense and transcription', async () => {
    // Create a mock Request with formData method
    const fakeFile = new Blob(['audio'], { type: 'audio/webm' });
    const mockFormData = {
      get: (name: string) => (name === 'audio' ? (fakeFile as any) : null),
    } as any;

    const req = {
      formData: async () => mockFormData,
    } as unknown as Request;

    const res = await POST(req);
    expect(res).toBeInstanceOf(Response);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.transcription).toBeDefined();
    expect(body.expense).toBeDefined();
    expect(body.expense.amount).toBe(25);
  });
});
