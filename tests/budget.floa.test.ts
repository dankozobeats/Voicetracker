import { describe, expect, it } from 'vitest';

import { BudgetLedgerService } from '@/lib/budget';
import type { BudgetEntity } from '@/types/budget';
import type { Transaction } from '@/models/transaction';

describe('BudgetLedgerService - deferred payments', () => {
  it('ignores Floa purchases and only counts the repayment in budgets', () => {
    const ledger = new BudgetLedgerService({} as any);
    const budgets: BudgetEntity[] = [
      {
        id: 'master',
        userId: 'user-1',
        name: 'Master',
        amount: 500,
        remaining: 500,
        isMaster: true,
        autoSyncFromSalary: false,
        parentId: null,
        category: null,
        createdAt: undefined,
        updatedAt: undefined,
      },
      {
        id: 'food',
        userId: 'user-1',
        name: 'Courses',
        amount: 200,
        remaining: 200,
        isMaster: false,
        autoSyncFromSalary: false,
        parentId: 'master',
        category: 'courses',
        createdAt: undefined,
        updatedAt: undefined,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'sg-1',
        userId: 'user-1',
        amount: 50,
        type: 'expense',
        category: 'courses',
        categoryId: null,
        paymentSource: 'sg',
        floaRepayment: false,
        date: '2024-06-05T00:00:00.000Z',
      },
      {
        id: 'floa-1',
        userId: 'user-1',
        amount: 70,
        type: 'expense',
        category: 'courses',
        categoryId: null,
        paymentSource: 'floa',
        floaRepayment: false,
        date: '2024-06-10T00:00:00.000Z',
      },
      {
        id: 'floa-repay',
        userId: 'user-1',
        amount: 70,
        type: 'expense',
        category: 'courses',
        categoryId: null,
        paymentSource: 'sg',
        floaRepayment: true,
        metadata: { floa_repayment_of: 'floa-1', period: '2024-06', category: 'courses' },
        date: '2024-07-01T12:00:00.000Z',
      },
    ];

    const dashboard = ledger.buildDashboard(budgets, transactions);
    const findBudget = (nodes: typeof dashboard.budgets, id: string): typeof dashboard.budgets[number] | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const child = findBudget(node.children, id);
        if (child) return child;
      }
      return undefined;
    };
    const food = findBudget(dashboard.budgets, 'food');

    expect(food?.spent).toBe(120); // SG charge + Floa repayment, without double counting the deferred purchase
    expect(food?.remaining).toBe(80);
  });
});
