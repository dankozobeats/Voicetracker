// -------------------------------------------
// Page listant les paiements différés en attente pour le mois courant.
// -------------------------------------------
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { RecurringService } from '@/lib/recurring';
import { TransactionService } from '@/lib/transactions';
import type { RecurringRule } from '@/models/recurring';
import type { Transaction } from '@/models/transaction';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const todayMonthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM
const sanitizeMonthKey = (value?: string | null) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12 || Number.isNaN(year)) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
};

const isDeferredPurchase = (tx: Transaction, targetMonth: string) => {
  return tx.paymentSource === 'floa' && !tx.floaRepayment && tx.date.slice(0, 7) === targetMonth;
};

const toUtcMidday = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
const addMonthsUtc = (date: Date, monthsToAdd: number, preferredDay?: number | null) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const targetDay = preferredDay ?? date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month + monthsToAdd, 1, 12, 0, 0, 0));
  const lastDay = new Date(
    Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12, 0, 0, 0),
  ).getUTCDate();
  candidate.setUTCDate(Math.min(targetDay, lastDay));
  return candidate;
};
const incrementCursor = (date: Date, rule: RecurringRule) => {
  const next = toUtcMidday(new Date(date));
  const preferredDay = rule.dayOfMonth ?? next.getUTCDate();
  switch (rule.cadence) {
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      if (rule.weekday !== null && rule.weekday !== undefined) {
        const diff = rule.weekday - next.getUTCDay();
        next.setUTCDate(next.getUTCDate() + diff);
      }
      return next;
    case 'monthly':
      return addMonthsUtc(next, 1, preferredDay);
    case 'quarterly':
      return addMonthsUtc(next, 3, preferredDay);
    case 'yearly':
      return addMonthsUtc(next, 12, preferredDay);
    default:
      return next;
  }
};
const occurrencesForMonth = (rule: RecurringRule, monthKey: string): Date[] => {
  const [year, month] = monthKey.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));

  let cursor = toUtcMidday(new Date(rule.startDate));
  const endDate = rule.endDate ? toUtcMidday(new Date(rule.endDate)) : null;
  if (cursor > monthEnd) return [];

  while (cursor < monthStart) {
    cursor = incrementCursor(cursor, rule);
    if (endDate && cursor > endDate) return [];
  }
  if (endDate && cursor > endDate) return [];

  const dates: Date[] = [];
  while (cursor <= monthEnd && (!endDate || cursor <= endDate)) {
    dates.push(toUtcMidday(cursor));
    cursor = incrementCursor(cursor, rule);
  }
  return dates;
};

const resolveMonthParam = async (
  searchParams?: Promise<URLSearchParams | null> | URLSearchParams | Record<string, string | string[] | undefined> | null,
) => {
  if (!searchParams) return undefined;
  if (typeof (searchParams as any)?.then === 'function') {
    return resolveMonthParam(await searchParams);
  }
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get('month') ?? undefined;
  }
  if (typeof searchParams === 'object') {
    const value = (searchParams.month ?? undefined) as string | string[] | undefined;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  return undefined;
};

export default async function DeferredPage({
  searchParams,
}: {
  searchParams?: Promise<URLSearchParams | null> | URLSearchParams | Record<string, string | string[] | undefined> | null;
}) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? process.env.SUPABASE_DEFAULT_USER_ID ?? process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
  if (!userId) {
    redirect('/auth/login?redirectedFrom=/deferred');
  }

  const transactionService = new TransactionService();
  const transactions = await transactionService.list({}, userId);
  const requestedMonth = await resolveMonthParam(searchParams);
  const currentMonth = sanitizeMonthKey(requestedMonth) ?? todayMonthKey();
  const manualDeferred = transactions
    .filter((tx) => isDeferredPurchase(tx, currentMonth))
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  const recurringService = new RecurringService();
  const recurringRules = await recurringService.listRules(userId);
  const recurringDeferred = recurringRules
    .filter((rule) => rule.direction !== 'income' && rule.paymentSource === 'floa')
    .flatMap((rule) =>
      occurrencesForMonth(rule, currentMonth).map((date) => ({
        id: `floa-${rule.id}-${date.toISOString()}`,
        userId: rule.userId,
        amount: rule.amount,
        paymentSource: 'floa' as const,
        floaRepayment: false,
        metadata: { recurringRuleId: rule.id, period: currentMonth },
        account: null,
        settlementDate: null,
        category: rule.category,
        categoryId: null,
        categoryInfo: null,
        budgetId: null,
        description: rule.description ?? null,
        merchant: null,
        date: date.toISOString(),
        expenseDate: date.toISOString(),
        type: 'expense' as const,
      } as Transaction)),
    );

  const deferred = [...manualDeferred, ...recurringDeferred].sort((a, b) => (a.date > b.date ? -1 : 1));
  const total = deferred.reduce((sum, tx) => sum + tx.amount, 0);
  const monthLabel = (() => {
    const parsed = new Date(`${currentMonth}-01T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return currentMonth;
    return parsed.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Différé</p>
            <h1 className="text-xl font-semibold text-white">Paiements différés en attente</h1>
            <p className="text-sm text-slate-400">Achats Floa de {monthLabel} (remboursement le mois suivant).</p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-400">
              Mois
              <input
                type="month"
                name="month"
                defaultValue={currentMonth}
                className="min-w-[150px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Afficher
            </button>
          </form>
          <div className="rounded-lg bg-amber-500/15 px-3 py-2 text-right">
            <p className="text-xs text-amber-200">Total mois {currentMonth}</p>
            <p className="text-xl font-bold text-amber-100">{total.toFixed(2)}€</p>
          </div>
        </div>
      </div>

      {deferred.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          Aucun paiement différé trouvé pour {monthLabel}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {deferred.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">{tx.date.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-white">{tx.description || 'Sans description'}</td>
                  <td className="px-4 py-2 text-slate-300">
                    {tx.categoryInfo?.name ?? (tx.metadata as any)?.category ?? tx.category}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-amber-100">{tx.amount.toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
