'use client';

import { useEffect, useState } from 'react';

import type { BudgetBalance, BudgetProjection, BudgetRule, BudgetUsage } from '@/models/budget';
import type { TransactionCategory } from '@/models/transaction';
import { categories } from '@/lib/schemas';

type BudgetManagerProps = {
  initialBudgets: BudgetRule[];
  initialUsage: BudgetUsage[];
  initialProjections: BudgetProjection[];
  initialBalance: BudgetBalance | null;
};

const defaultForm = {
  id: null as string | null,
  category: 'autre' as TransactionCategory,
  monthlyLimit: '',
  alertThreshold: '0.8',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
};

export default function BudgetManager({ initialBudgets, initialUsage, initialProjections, initialBalance }: BudgetManagerProps) {
  const [budgets, setBudgets] = useState<BudgetRule[]>(initialBudgets);
  const [usage, setUsage] = useState<BudgetUsage[]>(initialUsage);
  const [projections, setProjections] = useState<BudgetProjection[]>(initialProjections);
  const [balance, setBalance] = useState<BudgetBalance | null>(initialBalance);
  const [form, setForm] = useState(defaultForm);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    // -------------------------------------------
    // Forcer no-store pour éviter un cache éventuel du handler /api/budget
    // -------------------------------------------
    const res = await fetch('/api/budget', { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload?.error ?? 'Impossible de charger les budgets');
      return;
    }
    setBudgets(payload.budgets ?? []);
    setUsage(payload.usage ?? []);
    setProjections(payload.projections ?? []);
    setBalance(payload.balance ?? null);
  };

  useEffect(() => {
    if (!initialBudgets.length) {
      refresh().catch(() => undefined);
    }
  }, [initialBudgets.length]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const body = {
      category: form.category,
      monthlyLimit: Number(form.monthlyLimit),
      alertThreshold: Number(form.alertThreshold),
      startDate: form.startDate,
      endDate: form.endDate || null,
    };
    const method = form.id ? 'PATCH' : 'POST';
    const url = form.id ? `/api/budget?id=${form.id}` : '/api/budget';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Erreur lors de la sauvegarde');
      return;
    }
    setForm(defaultForm);
    await refresh();
  };

  const handleEdit = (rule: BudgetRule) => {
    setForm({
      id: rule.id,
      category: rule.category,
      monthlyLimit: String(rule.monthlyLimit),
      alertThreshold: String(rule.alertThreshold),
      startDate: rule.startDate.slice(0, 10),
      endDate: rule.endDate ? rule.endDate.slice(0, 10) : '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/budget?id=${id}`, { method: 'DELETE' });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Erreur lors de la suppression');
      return;
    }
    if (form.id === id) setForm(defaultForm);
    await refresh();
  };

  const renderCards = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {usage.map((entry) => {
        const projection = projections.find((p) => p.category === entry.category);
        const budgetRule = budgets.find((b) => b.category === entry.category);
        return (
          <div key={entry.category} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-300">{entry.category}</p>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  entry.status === 'over'
                    ? 'bg-rose-500/20 text-rose-200'
                    : entry.status === 'warning'
                      ? 'bg-amber-500/20 text-amber-100'
                      : 'bg-emerald-500/20 text-emerald-100'
                }`}
              >
                {entry.status}
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold text-white">
              {entry.spent.toFixed(2)}€ / {entry.limit.toFixed(2)}€
            </div>
            <p className="text-xs text-slate-500">Seuil d&apos;alerte: {(entry.threshold * 100).toFixed(0)}%</p>
            {projection ? (
              <p className="mt-2 text-sm text-slate-400">
                Projection: {projection.projectedSpend.toFixed(2)}€ ({projection.overrunDelta > 0 ? 'dépassement' : 'ok'})
              </p>
            ) : null}
            <div className="mt-3 text-xs text-slate-500">
              Période: {budgetRule?.startDate?.slice(0, 10) ?? '—'}{' '}
              {budgetRule?.endDate ? `→ ${budgetRule.endDate.slice(0, 10)}` : ''}
            </div>
            <div className="mt-3 flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => budgetRule && handleEdit(budgetRule)}
                className="rounded bg-slate-800 px-3 py-1 text-slate-200"
                disabled={loading || !budgetRule}
              >
                Éditer
              </button>
              {budgetRule ? (
                <button
                  type="button"
                  onClick={() => handleDelete(budgetRule.id)}
                  className="rounded bg-red-600 px-3 py-1 text-white"
                  disabled={loading}
                >
                  Supprimer
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderList = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left text-slate-400">
          <tr>
            <th className="px-4 py-3">Catégorie</th>
            <th className="px-4 py-3">Plafond</th>
            <th className="px-4 py-3">Seuil</th>
            <th className="px-4 py-3">Période</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {budgets.map((rule) => (
            <tr key={rule.id} className="hover:bg-slate-800/40">
              <td className="px-4 py-3 text-slate-200">{rule.category}</td>
              <td className="px-4 py-3 text-slate-200">{rule.monthlyLimit.toFixed(2)}€</td>
              <td className="px-4 py-3 text-slate-200">{(rule.alertThreshold * 100).toFixed(0)}%</td>
              <td className="px-4 py-3 text-slate-200">
                {rule.startDate.slice(0, 10)} {rule.endDate ? `→ ${rule.endDate.slice(0, 10)}` : ''}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(rule)}
                    className="rounded bg-slate-800 px-3 py-1 text-slate-200"
                    disabled={loading}
                  >
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule.id)}
                    className="rounded bg-red-600 px-3 py-1 text-white"
                    disabled={loading}
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
        >
          {showForm ? 'Masquer le formulaire' : 'Ajouter / éditer un budget'}
        </button>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          Vue :
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`rounded px-3 py-1 ${viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Cartes
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded px-3 py-1 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
          >
            Liste
          </button>
        </div>
      </div>

      {balance ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">Balance globale</p>
              <p className="text-xs text-slate-500">Mois: {balance.month}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                balance.balance >= 0 ? 'bg-emerald-500/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'
              }`}
            >
              {balance.balance >= 0 ? 'positif' : 'négatif'}
            </span>
          </div>
          <div className="mt-2 text-3xl font-bold text-white">{balance.balance.toFixed(2)}€</div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <p className="text-xs text-slate-400">Revenus</p>
              <p className="text-lg font-semibold text-emerald-100">{balance.income.toFixed(2)}€</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <p className="text-xs text-slate-400">Dépenses</p>
              <p className="text-lg font-semibold text-white">{balance.expenses.toFixed(2)}€</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <p className="text-xs text-slate-400">Charges fixes (mois)</p>
              <p className="text-lg font-semibold text-amber-100">{balance.fixedCharges.toFixed(2)}€</p>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">{form.id ? 'Modifier un budget' : 'Ajouter un budget'}</p>
            {form.id ? (
              <button
                type="button"
                onClick={() => setForm(defaultForm)}
                className="text-xs text-slate-400 underline"
                disabled={loading}
              >
                Annuler
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Catégorie
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as TransactionCategory }))}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Plafond mensuel (€)
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                required
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyLimit}
                onChange={(e) => setForm((prev) => ({ ...prev, monthlyLimit: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Seuil d&apos;alerte (0-1)
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                required
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={form.alertThreshold}
                onChange={(e) => setForm((prev) => ({ ...prev, alertThreshold: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Début
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Fin (optionnel)
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? 'Enregistrement...' : form.id ? 'Mettre à jour' : 'Ajouter'}
          </button>
        </form>
      ) : null}

      {viewMode === 'cards' ? renderCards() : renderList()}
    </div>
  );
}
