'use client';

// -------------------------------------------
// Liste hiérarchique des budgets + formulaire d'édition rapide
// -------------------------------------------
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { categories } from '@/lib/schemas';
import type { BudgetWithUsage } from '@/types/budget';
import BudgetCard from '@/components/BudgetCard';

type BudgetListProps = {
  budgets: BudgetWithUsage[];
};

/**
 * Composant affichant tous les budgets et permettant l'édition/suppression.
 */
export default function BudgetList({ budgets }: BudgetListProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<BudgetWithUsage | null>(null);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    category: '',
    isMaster: false,
    parentId: '',
    autoSyncFromSalary: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Parent master disponible pour rattacher les sous-budgets
  const master = useMemo(() => budgets.find((b) => b.isMaster) ?? null, [budgets]);

  const toggleNode = (id: string, state?: boolean) => {
    setCollapsed((prev) => ({ ...prev, [id]: state ?? !prev[id] }));
  };

  const toggleAll = (shouldCollapse: boolean) => {
    const next: Record<string, boolean> = {};
    const walk = (budget: BudgetWithUsage) => {
      next[budget.id] = shouldCollapse;
      budget.children.forEach(walk);
    };
    budgets.forEach(walk);
    setCollapsed(next);
  };

  /**
   * Ouvre le formulaire d'édition avec les données existantes.
   */
  const handleEdit = (budget: BudgetWithUsage) => {
    setEditing(budget);
    setForm({
      name: budget.name,
      amount: String(budget.amount),
      category: budget.category ?? '',
      isMaster: budget.isMaster,
      parentId: budget.parentId ?? master?.id ?? '',
      autoSyncFromSalary: budget.autoSyncFromSalary,
    });
    setError(null);
  };

  /**
   * Supprime un budget enfant puis rafraîchit la page.
   */
  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Erreur lors de la suppression');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error('[budget] delete failed', err);
      setError('Suppression impossible (réseau ou authentification).');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Soumet le formulaire d'édition (PATCH).
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/budgets/${editing.id}`, {
      method: 'PATCH',
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
      setError(payload?.error ?? 'Erreur lors de la mise à jour');
      return;
    }
    setEditing(null);
    router.refresh();
  };

  /**
   * Rend récursivement chaque budget et ses enfants.
   */
  const renderBudget = (budget: BudgetWithUsage, depth: number) => (
    <div key={budget.id} className="space-y-3">
      <BudgetCard
        budget={budget}
        depth={depth}
        collapsed={collapsed[budget.id] ?? false}
        onToggleCollapse={() => toggleNode(budget.id)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      {budget.children.length && !(collapsed[budget.id] ?? false) ? (
        <div className="space-y-3 border-l border-slate-800 pl-4">
          {budget.children.map((child) => renderBudget(child, depth + 1))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Budgets</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:border-slate-500"
            onClick={() => toggleAll(false)}
            disabled={!budgets.length}
          >
            Tout déployer
          </button>
          <button
            type="button"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:border-slate-500"
            onClick={() => toggleAll(true)}
            disabled={!budgets.length}
          >
            Tout réduire
          </button>
        </div>
        {editing ? (
          <button
            type="button"
            className="text-xs text-slate-400 underline"
            onClick={() => setEditing(null)}
            disabled={loading}
          >
            Annuler l&apos;édition
          </button>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm font-medium text-slate-200">Modifier le budget sélectionné</p>
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
                  Catégorie
                  <select
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
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
                  Budget parent
                  <select
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                    value={form.parentId}
                    onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))}
                  >
                    <option value="">Sélectionner le budget principal</option>
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
                    Actualiser automatiquement ce budget principal sur les revenus &ldquo;salaire&rdquo; du mois courant.
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
            Sauvegarder
          </button>
        </form>
      ) : null}

      <div className="space-y-4">
        {budgets.map((budget) => renderBudget(budget, 0))}
        {!budgets.length ? <p className="text-sm text-slate-400">Aucun budget créé pour le moment.</p> : null}
      </div>
    </div>
  );
}
