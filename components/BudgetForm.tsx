'use client';

// -------------------------------------------
// Formulaire de création d'un budget (master ou sous-budget)
// -------------------------------------------
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { categories } from '@/lib/schemas';
import type { BudgetWithUsage } from '@/types/budget';

type BudgetFormProps = {
  budgets: BudgetWithUsage[];
};

/**
 * Formulaire autonome pour ajouter un budget.
 * - isMaster = true => budget principal, remaining = amount
 * - isMaster = false => sous-budget rattaché au master sélectionné
 */
export default function BudgetForm({ budgets }: BudgetFormProps) {
  const router = useRouter();
  const master = useMemo(() => budgets.find((b) => b.isMaster) ?? null, [budgets]);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    isMaster: !master, // si aucun master existant, on propose d'abord de créer le principal
    category: '',
    parentId: master?.id ?? '',
    autoSyncFromSalary: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Soumission du formulaire de création (POST /api/budgets).
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.isMaster && !master) {
      setError('Créez d’abord un budget principal.');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        amount: Number(form.amount),
        isMaster: form.isMaster,
        parentId: form.isMaster ? null : form.parentId || null,
        category: form.isMaster ? null : form.category || null,
        autoSyncFromSalary: form.isMaster ? form.autoSyncFromSalary : false,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Erreur lors de la création');
      return;
    }
    setForm({
      name: '',
      amount: '',
      isMaster: false,
      category: '',
      parentId: master?.id ?? '',
      autoSyncFromSalary: true,
    });
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Ajouter un budget</p>
          <p className="text-xs text-slate-400">
            Master = salaire/global ; Sous-budget = catégorie avec déduction automatique
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={form.isMaster}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                isMaster: e.target.checked,
                autoSyncFromSalary: e.target.checked ? prev.autoSyncFromSalary : false,
              }))
            }
            disabled={!!master}
          />
          Budget principal ?
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Nom
          <input
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </label>
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

        {!form.isMaster ? (
          <>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Catégorie associée
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                required
              >
                <option value="">Choisir</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Budget principal
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.parentId}
                onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
                required
              >
                <option value="">Sélectionner</option>
                {master ? (
                  <option value={master.id}>
                    {master.name} ({master.remaining.toFixed(2)}€ restants)
                  </option>
                ) : null}
              </select>
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">
            Synchronisation salaire
            <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-500"
                checked={form.autoSyncFromSalary}
                onChange={(e) => setForm((prev) => ({ ...prev, autoSyncFromSalary: e.target.checked }))}
              />
              <div className="text-xs text-slate-300">
                Recalibrer automatiquement le budget principal sur les revenus &ldquo;salaire&rdquo; du mois courant.
              </div>
            </div>
          </label>
        )}
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <button
        type="submit"
        className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        disabled={loading}
      >
        Créer le budget
      </button>
    </form>
  );
}
