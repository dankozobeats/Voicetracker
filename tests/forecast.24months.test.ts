import { describe, expect, beforeEach, it, vi } from 'vitest';

import { RecurringService } from '@/lib/recurring';
import type { RecurringRule } from '@/models/recurring';
import { createMockSupabase, mockUtils } from './helpers/mockSupabase';

mockUtils();

const rule = (overrides: Partial<RecurringRule>): RecurringRule => ({
  id: 'r-' + Math.random().toString(36).slice(2, 7),
  userId: 'user-1',
  amount: 100,
  category: 'autre',
  description: 'Charge',
  direction: 'expense',
  cadence: 'monthly',
  dayOfMonth: 5,
  weekday: null,
  startDate: '2024-06-01',
  endDate: null,
  paymentSource: 'sg',
  ...overrides,
});

describe('Forecast 24 months with SG/Floa/overdraft', () => {
  let service: RecurringService;
  let db: ReturnType<typeof createMockSupabase>['db'];

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJmock-test-key-placeholder123456';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
    const supabase = createMockSupabase();
    db = supabase.db;
    service = new RecurringService();
    // Patch client and overdraft helper for determinism.
    (service as any).client = supabase.client;
    (service as any).computeStartingOverdraft = vi.fn(async () => 0);
  });

  it('SG-only scenario matches same-month charges', async () => {
    const { monthSummaries } = await service.generateUpcomingWithCarryover([rule({ paymentSource: 'sg' })], 'user-1', 2);
    const first = monthSummaries[0];
    expect(first.sgChargesTotal).toBe(100);
    expect(first.floaRepaymentsTotal).toBe(0);
    expect(first.overdraftOutgoing).toBe(100);
  });

  it('Floa-only scenario shifts to next month repayment', async () => {
    const { monthSummaries } = await service.generateUpcomingWithCarryover([rule({ paymentSource: 'floa' })], 'user-1', 2);
    const first = monthSummaries[0];
    const second = monthSummaries[1];
    expect(first.sgChargesTotal).toBe(0);
    expect(first.floaRepaymentsTotal).toBe(100);
    expect(second.floaRepaymentsTotal).toBe(100);
  });

  it('Mixed scenario computes overdraft roll', async () => {
    // Add an existing Floa repayment tx in DB to ensure dedup
    db.transactions.push({
      id: 'tx-repay',
      user_id: 'user-1',
      amount: 50,
      date: '2024-07-01T12:00:00.000Z',
      floa_repayment: true,
      metadata: { floa_repayment_of: 'manual', period: '2024-06' },
      payment_source: 'sg',
      type: 'expense',
    });

    const { monthSummaries } = await service.generateUpcomingWithCarryover(
      [rule({ amount: 120, paymentSource: 'sg' }), rule({ amount: 80, paymentSource: 'floa', id: 'floa-1' })],
      'user-1',
      3,
    );
    const july = monthSummaries.find((m) => m.month === '2024-07');
    expect(july?.sgChargesTotal).toBe(120);
    expect(july?.floaRepaymentsTotal).toBe(50 + 80); // manual repayment + recurring repayment
  });

  it('Overdraft propagates when balance negative', async () => {
    const { monthSummaries } = await service.generateUpcomingWithCarryover(
      [rule({ amount: 300, paymentSource: 'sg' })],
      'user-1',
      2,
    );
    const june = monthSummaries[0];
    const july = monthSummaries[1];
    // salary == income, but we only have expenses -> solde negative => overdraft
    expect(june.overdraftOutgoing).toBeGreaterThanOrEqual(0);
    expect(july.overdraftIncoming).toBe(june.overdraftOutgoing);
  });
});
