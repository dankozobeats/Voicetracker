'use client';

// -------------------------------------------
// Formulaire transaction avec auto-sélection du budget par catégorie
// -------------------------------------------
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { categories } from '@/lib/schemas';
import type { BudgetWithUsage } from '@/types/budget';

type TransactionFormProps = {
  budgets: BudgetWithUsage[];
};

/**
 * Formulaire simple pour créer une transaction et déduire automatiquement le budget.
 */
export default function TransactionForm({ budgets }: TransactionFormProps) {
  const router = useRouter();
  // Liste aplatie pour parcourir master + enfants
  const flatBudgets = useMemo(() => {
    const all: BudgetWithUsage[] = [];
    const walk = (budget: BudgetWithUsage) => {
      all.push(budget);
      budget.children.forEach(walk);
    };
    budgets.forEach(walk);
    return all;
  }, [budgets]);
  const [form, setForm] = useState({
    amount: '',
    category: categories[0],
    type: 'expense' as 'income' | 'expense' | 'transfer',
    date: new Date().toISOString().slice(0, 10),
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Budget automatiquement lié à la catégorie sélectionnée
  const matchedBudget = useMemo(
    () => flatBudgets.find((b) => !b.isMaster && b.category === form.category) ?? flatBudgets.find((b) => b.isMaster) ?? null,
    [flatBudgets, form.category],
  );

  /**
   * Envoi de la transaction vers /api/transactions.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(form.amount),
        category: form.category,
        type: form.type,
        expenseDate: form.date,
        description: form.description || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Impossible de créer la transaction');
      return;
    }
    setForm((prev) => ({ ...prev, amount: '', description: '' }));
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Ajouter une transaction</p>
          <p className="text-xs text-slate-400">Le budget est choisi automatiquement selon la catégorie</p>
        </div>
        <select
          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
          value={form.type}
          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as typeof form.type }))}
        >
          <option value="expense">Dépense</option>
          <option value="income">Revenu</option>
          <option value="transfer">Transfert</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Montant (€)
          <input
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            required
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Catégorie
          <select
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Date
          <input
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Description
          <input
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="ex: déjeuner, Uber..."
          />
        </label>
      </div>

      {matchedBudget ? (
        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300">
          <p className="font-semibold text-white">Budget utilisé: {matchedBudget.name}</p>
          <p>
            Restant: {matchedBudget.remaining.toFixed(2)}€ / {matchedBudget.amount.toFixed(2)}€ ·{' '}
            {(matchedBudget.progress * 100).toFixed(0)}% consommé
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-300">
          Aucun budget pour cette catégorie (la transaction sera créée sans déduction).
        </p>
      )}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <button
        type="submit"
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        disabled={loading}
      >
        Enregistrer la transaction
      </button>
    </form>
  );
}
