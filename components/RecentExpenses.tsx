'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ExpenseRow = {
  id?: string;
  amount: number;
  category: string;
  description?: string | null;
  expense_date?: string | null;
  created_at?: string | null;
};

type EditState = {
  id: string;
  amount: string;
  category: string;
  description: string;
  expense_date: string;
};

const formatDateTime = (primary?: string | null, secondary?: string | null) => {
  const candidate = primary || secondary;
  if (!candidate) return '—';

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
};

export default function RecentExpenses() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchExpenses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/expenses', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!payload || !Array.isArray(payload.expenses)) {
        throw new Error('Réponse serveur invalide');
      }
      setRows(payload.expenses);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les dépenses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();

    const onUpdate = () => fetchExpenses();
    window.addEventListener('expenses:updated', onUpdate);

    const interval = window.setInterval(fetchExpenses, 30000);

    return () => {
      window.removeEventListener('expenses:updated', onUpdate);
      window.clearInterval(interval);
    };
  }, [fetchExpenses]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [rows]);

  const startEdit = (row: ExpenseRow) => {
    if (!row.id) return;
    setEditing({
      id: row.id,
      amount: String(row.amount ?? ''),
      category: row.category ?? '',
      description: row.description ?? '',
      expense_date: row.expense_date ? new Date(row.expense_date).toISOString().slice(0, 10) : '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setIsSaving(false);
  };

  const saveEdit = async () => {
    if (!editing?.id) return;
    setIsSaving(true);
    try {
      const payload = {
        amount: Number(editing.amount),
        category: editing.category,
        description: editing.description || null,
        expense_date: editing.expense_date || undefined,
      };
      const res = await fetch(`/api/expenses/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Mise à jour impossible');
      if (json?.expense) {
        setRows((prev) =>
          prev.map((row) => (row.id === editing.id ? { ...row, ...json.expense } : row)),
        );
      }
      setSelected(new Set());
      setEditing(null);
      window.dispatchEvent(new Event('expenses:updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRow = async (id?: string) => {
    if (!id) return;
    const confirm = window.confirm('Supprimer cette dépense ?');
    if (!confirm) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Suppression impossible');
      setRows((prev) => prev.filter((row) => row.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      window.dispatchEvent(new Event('expenses:updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const confirm = window.confirm(`Supprimer ${ids.length} dépense(s) ?`);
    if (!confirm) return;
    try {
      setIsSaving(true);
      const responses = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
          const json = await res.json().catch(() => null);
          if (!res.ok) throw new Error(json?.error || 'Suppression impossible');
          return id;
        }),
      );
      setRows((prev) => prev.filter((row) => !responses.includes(row.id || '')));
      setSelected(new Set());
      window.dispatchEvent(new Event('expenses:updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression multiple impossible');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Journal</p>
          <h3 className="text-2xl font-semibold text-white">Dernières dépenses</h3>
          <p className="text-sm text-slate-300">Aperçu des 10 dernières entrées.</p>
          <p className="text-sm text-emerald-200 mt-1">Total affiché: {total.toFixed(2)} €</p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              type="button"
              className="rounded-full border border-rose-500 px-4 py-2 text-xs font-semibold text-rose-100 shadow-sm hover:bg-rose-500/10 disabled:opacity-60"
              onClick={deleteSelected}
              disabled={isSaving}
            >
              Supprimer la sélection ({selected.size})
            </button>
          )}
          {isLoading && <span className="text-xs text-slate-400">Chargement…</span>}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-100">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="py-3 pr-4">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-indigo-500"
                  checked={rows.length > 0 && selected.size === rows.filter((r) => r.id).length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(rows.map((r) => r.id).filter(Boolean) as string[]));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </th>
              <th className="py-3 pr-4">Date / Heure</th>
              <th className="py-3 pr-4">Catégorie</th>
              <th className="py-3 pr-4">Description</th>
              <th className="py-3 pr-4">Actions</th>
              <th className="py-3 pr-4 text-right">Montant (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Aucune dépense enregistrée pour le moment.
                </td>
              </tr>
            ) : (
              rows.map((expense) => (
                <tr key={expense.id ?? `${expense.expense_date}-${expense.amount}-${expense.created_at}`}>
                  <td className="py-3 pr-4 align-middle">
                    {expense.id ? (
                      <input
                        type="checkbox"
                        aria-label="Sélectionner cette dépense"
                        className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-indigo-500"
                        checked={selected.has(expense.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(expense.id as string);
                            } else {
                              next.delete(expense.id as string);
                            }
                            return next;
                          });
                        }}
                      />
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-slate-200">
                    {formatDateTime(expense.created_at, expense.expense_date)}
                  </td>
                  <td className="py-3 pr-4">
                    {editing?.id === expense.id ? (
                      <select
                        className="w-full rounded-lg border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        value={editing.category}
                        onChange={(e) => setEditing((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                      >
                        <option value="">Catégorie</option>
                        <option value="restaurant">restaurant</option>
                        <option value="courses">courses</option>
                        <option value="transport">transport</option>
                        <option value="loisirs">loisirs</option>
                        <option value="santé">santé</option>
                        <option value="shopping">shopping</option>
                        <option value="autre">autre</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100">
                        {expense.category}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-200">
                    {editing?.id === expense.id ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          className="w-full rounded-lg border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-sm text-white"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editing.amount}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                        />
                        <input
                          className="w-full rounded-lg border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-sm text-white"
                          type="date"
                          value={editing.expense_date}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, expense_date: e.target.value } : prev))}
                        />
                        <input
                          className="w-full rounded-lg border border-slate-500/50 bg-slate-900/60 px-3 py-2 text-sm text-white md:col-span-2"
                          type="text"
                          maxLength={200}
                          placeholder="Description"
                          value={editing.description}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                        />
                      </div>
                    ) : (
                      expense.description || <span className="text-slate-500">Sans description</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-200">
                    {editing?.id === expense.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          onClick={saveEdit}
                          disabled={isSaving}
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-slate-500 px-3 py-1 text-xs font-semibold text-slate-200"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-slate-500 px-3 py-1 text-xs font-semibold text-slate-200"
                          onClick={() => startEdit(expense)}
                          disabled={isSaving}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-200"
                          onClick={() => deleteRow(expense.id)}
                          disabled={isSaving}
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold text-emerald-200">
                    {Number(expense.amount).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
