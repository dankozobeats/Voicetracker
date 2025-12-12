import { describe, expect, beforeEach, it, vi } from 'vitest';

import { TransactionService } from '@/lib/transactions';
import { mockUtils, createMockSupabase } from './helpers/mockSupabase';

mockUtils();

describe('TransactionService - Floa treasury', () => {
  let service: TransactionService;
  let db: ReturnType<typeof createMockSupabase>['db'];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const supabase = createMockSupabase();
    db = supabase.db;
    service = new TransactionService();
    // Patch client and budget ledger with mocks for isolation
    (service as any).client = supabase.client;
    (service as any).budgetLedger = {
      listForUser: vi.fn().mockResolvedValue([]),
      matchBudgetForCategory: vi.fn(),
    };
  });

  it('creates SG expense and counts it in current month totals', async () => {
    await service.create({
      userId: 'user-1',
      amount: 100,
      category: 'autre',
      type: 'expense',
      expenseDate: '2024-06-10',
      paymentSource: 'sg',
    });
    const totals = await service.computeMonthlyTotals('user-1');
    const june = totals.find((t) => t.month === '2024-06');
    expect(june?.expenseTotal).toBe(100);
  });

  it('creates Floa expense, excludes it from current month, and schedules repayment next month', async () => {
    await service.create({
      userId: 'user-1',
      amount: 50,
      category: 'autre',
      type: 'expense',
      expenseDate: '2024-06-12',
      paymentSource: 'floa',
    });

    const totals = await service.computeMonthlyTotals('user-1');
    const june = totals.find((t) => t.month === '2024-06');
    const july = totals.find((t) => t.month === '2024-07');
    expect(june?.expenseTotal ?? 0).toBe(0);
    // Repayment scheduled on next month first day at noon -> counted in July
    expect(july?.expenseTotal).toBe(50);
    const repayment = db.transactions.find((t) => t.floa_repayment);
    expect(repayment?.payment_source).toBe('sg');
    expect(repayment?.metadata?.period).toBe('2024-06');
  });

  it('toggle SG -> Floa triggers repayment', async () => {
    const created = await service.create({
      userId: 'user-1',
      amount: 80,
      category: 'autre',
      type: 'expense',
      expenseDate: '2024-06-05',
      paymentSource: 'sg',
    });
    await service.update(created.id, { paymentSource: 'floa' }, 'user-1');
    const repayment = db.transactions.find((t) => t.floa_repayment);
    expect(repayment).toBeTruthy();
    expect(repayment?.metadata?.floa_repayment_of).toBe(created.id);
  });

  it('toggle Floa -> SG removes repayment', async () => {
    const created = await service.create({
      userId: 'user-1',
      amount: 30,
      category: 'autre',
      type: 'expense',
      expenseDate: '2024-06-08',
      paymentSource: 'floa',
    });
    expect(db.transactions.some((t) => t.floa_repayment)).toBe(true);
    await service.update(created.id, { paymentSource: 'sg' }, 'user-1');
    expect(db.transactions.some((t) => t.floa_repayment)).toBe(false);
  });

  it('idempotency: updating Floa twice does not duplicate repayment', async () => {
    const created = await service.create({
      userId: 'user-1',
      amount: 60,
      category: 'autre',
      type: 'expense',
      expenseDate: '2024-06-09',
      paymentSource: 'floa',
    });
    const before = db.transactions.filter((t) => t.floa_repayment).length;
    await service.update(created.id, { amount: 65, paymentSource: 'floa' }, 'user-1');
    const after = db.transactions.filter((t) => t.floa_repayment).length;
    expect(after).toBe(before); // repayment refreshed, not duplicated
  });
});
