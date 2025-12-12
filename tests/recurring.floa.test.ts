import { describe, expect, beforeEach, it, vi } from 'vitest';

import { RecurringService } from '@/lib/recurring';
import type { RecurringRule } from '@/models/recurring';
import { createMockSupabase, mockUtils } from './helpers/mockSupabase';

mockUtils();

const baseRule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'rule-1',
  userId: 'user-1',
  amount: 100,
  category: 'autre',
  description: 'Test',
  direction: 'expense',
  cadence: 'monthly',
  dayOfMonth: 5,
  weekday: null,
  startDate: '2024-06-01',
  endDate: null,
  paymentSource: 'sg',
  ...overrides,
});

describe('RecurringService Floa rules', () => {
  let service: RecurringService;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJmock-test-key-placeholder123456';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
    const supabase = createMockSupabase();
    service = new RecurringService();
    // Patch client and neutral overdraft computation for deterministic tests.
    (service as any).client = supabase.client;
    (service as any).computeStartingOverdraft = vi.fn(async () => 0);
  });

  it('SG recurring rule produces current-month charge', () => {
    const instances = service.generateUpcomingInstances([baseRule()], 2);
    expect(instances.some((i) => i.dueDate.startsWith('2024-07'))).toBe(true);
    expect(instances.some((i) => i.category === 'floa_bank')).toBe(false);
  });

  it('Floa recurring rule skips current month charge and adds next-month repayment', () => {
    const instances = service.generateUpcomingInstances([baseRule({ paymentSource: 'floa' })], 2);
    expect(instances.some((i) => i.category === 'floa_bank')).toBe(true);
    // No SG expense in the schedule
    expect(instances.some((i) => i.category !== 'floa_bank' && i.direction === 'expense')).toBe(false);
  });

  it('Floa recurring rule repayment carries metadata for idempotency', () => {
    const instances = service.generateUpcomingInstances([baseRule({ paymentSource: 'floa' })], 2);
    const repayment = instances.find((i) => i.category === 'floa_bank');
    expect(repayment?.metadata?.recurringRuleId).toBe('rule-1');
    expect(repayment?.metadata?.period).toBeDefined();
  });

  it('excludes Floa repayments from fixed charges totals', () => {
    const instances = [
      {
        ruleId: 'sg-1',
        dueDate: '2024-07-05T12:00:00.000Z',
        amount: 120,
        category: 'autre',
        description: 'SG expense',
        direction: 'expense' as const,
        kind: 'recurring' as const,
      },
      {
        ruleId: 'floa-repay',
        dueDate: '2024-07-01T12:00:00.000Z',
        amount: 80,
        category: 'floa_bank',
        description: 'Remb Floa',
        direction: 'expense' as const,
        kind: 'recurring' as const,
      },
    ];

    expect(service.computeTotalFixedCharges(instances)).toBe(120);
    expect(service.computeMonthlyFixedCharges(instances, '2024-07')).toBe(120);
  });
});
