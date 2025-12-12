'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  RECURRING_LOOKAHEAD_MONTHS,
  type RecurringInstance,
  type RecurringMonthSummary,
  type RecurringRule,
} from '@/models/recurring';
import type { TransactionCategory } from '@/models/transaction';
import { categories } from '@/lib/schemas';

type FormState = {
  id?: string | null;
  amount: string;
  category: TransactionCategory;
  description: string;
  direction: RecurringRule['direction'];
  cadence: RecurringRule['cadence'];
  dayOfMonth: string;
  weekday: string;
  startDate: string;
  endDate: string;
  paymentSource: RecurringRule['paymentSource'];
};

type RecurringManagerProps = {
  initialRules: RecurringRule[];
  initialUpcoming: RecurringInstance[];
  initialMonthSummaries: RecurringMonthSummary[];
  initialTotal: number;
};

const defaultForm: FormState = {
  id: null,
  amount: '',
  category: 'autre',
  description: '',
  direction: 'expense',
  cadence: 'monthly',
  dayOfMonth: '',
  weekday: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  paymentSource: 'sg',
};

const MONTH_GRADIENTS = [
  'from-indigo-500/25 via-indigo-500/5 to-slate-900/60',
  'from-emerald-500/25 via-emerald-500/5 to-slate-900/60',
  'from-amber-500/25 via-amber-500/5 to-slate-900/60',
  'from-rose-500/25 via-rose-500/5 to-slate-900/60',
];

const MONTH_BADGES = [
  'bg-indigo-500/15 text-indigo-100',
  'bg-emerald-500/15 text-emerald-100',
  'bg-amber-500/15 text-amber-900 dark:text-amber-100',
  'bg-rose-500/15 text-rose-100',
];

export default function RecurringManager({
  initialRules,
  initialUpcoming,
  initialMonthSummaries,
  initialTotal,
}: RecurringManagerProps) {
  const [rules, setRules] = useState<RecurringRule[]>(initialRules);
  const [upcoming, setUpcoming] = useState<RecurringInstance[]>(initialUpcoming);
  const [monthSummaries, setMonthSummaries] = useState<RecurringMonthSummary[]>(initialMonthSummaries);
  const [total, setTotal] = useState<number>(initialTotal);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [showRulesTable, setShowRulesTable] = useState(true);
  const [runningJob, setRunningJob] = useState(false);
  const [purging, setPurging] = useState(false);
  const [runMonth, setRunMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const isEditing = useMemo(() => !!form.id, [form.id]);

  const handleAddSalaryPreset = () => {
    setForm({
      ...defaultForm,
      amount: '',
      description: 'Salaire',
      direction: 'income',
      cadence: 'monthly',
      dayOfMonth: '1',
      paymentSource: 'sg',
    });
    setShowForm(true);
  };

  const refresh = async () => {
    const res = await fetch('/api/recurring');
    const payload = await res.json();
    if (!res.ok) {
      setError(payload?.error ?? 'Impossible de rafraîchir les charges fixes');
      return;
    }
    const refreshedRules = payload.rules ?? [];
    const refreshedUpcoming = payload.upcoming ?? [];
    const refreshedMonthSummaries = payload.monthSummaries ?? [];
    setRules(refreshedRules);
    setUpcoming(refreshedUpcoming);
    setMonthSummaries(refreshedMonthSummaries);
    setTotal(computeNextCycleTotal(refreshedUpcoming, refreshedMonthSummaries));
  };

  useEffect(() => {
    // Toujours rafraîchir côté client pour couvrir les cas où l'ID session est absent en SSR.
    refresh().catch(() => undefined);
  }, []);

  const handleRunRecurring = async () => {
    setRunningJob(true);
    setError(null);
    const res = await fetch('/api/recurring/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: runMonth }),
    }).catch((err) => {
      console.error('[recurring] run job failed', err);
      return null;
    });
    setRunningJob(false);
    if (!res || !res.ok) {
      setError('Échec du job récurrent');
      return;
    }
    await refresh();
  };

  const handlePurgeTransactions = async () => {
    setPurging(true);
    setError(null);
    const res = await fetch('/api/transactions?all=true', { method: 'DELETE' }).catch((err) => {
      console.error('[recurring] purge failed', err);
      return null;
    });
    setPurging(false);
    if (!res || !res.ok) {
      setError('Échec de la purge des transactions');
      return;
    }
    await refresh();
  };

  const groupedByYear = useMemo(() => {
    const grouped = upcoming.reduce((acc, instance) => {
      const monthKey = instance.dueDate.slice(0, 7); // YYYY-MM
      const yearKey = monthKey.slice(0, 4);
      acc[yearKey] = acc[yearKey] ?? {};
      acc[yearKey][monthKey] = acc[yearKey][monthKey] ?? [];
      acc[yearKey][monthKey].push(instance);
      return acc;
    }, {} as Record<string, Record<string, RecurringInstance[]>>);

    return Object.entries(grouped)
      .map(([year, months]) => ({
        year,
        months: Object.entries(months)
          .sort(([a], [b]) => (a > b ? 1 : -1))
          .map(([month, instances]) => ({ month, instances })),
      }))
      .sort((a, b) => (a.year > b.year ? 1 : -1));
  }, [upcoming]);

  const summaryByMonth = useMemo(() => {
    return new Map(monthSummaries.map((summary) => [summary.month, summary]));
  }, [monthSummaries]);

  useEffect(() => {
    const currentYear = new Date().getFullYear().toString();
    setExpandedYears((prev) => (Object.keys(prev).length ? prev : { [currentYear]: true }));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const body = {
      amount: Number(form.amount),
      category: form.category,
      description: form.description || null,
      direction: form.direction,
      cadence: form.cadence,
      dayOfMonth: form.dayOfMonth ? Number(form.dayOfMonth) : null,
      weekday: form.weekday ? Number(form.weekday) : null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      paymentSource: form.paymentSource,
    };
    const method = isEditing ? 'PATCH' : 'POST';
    const url = isEditing ? `/api/recurring?id=${form.id}` : '/api/recurring';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Erreur lors de la sauvegarde');
      return;
    }
    setForm(defaultForm);
    await refresh();
  };

  const handleEdit = (rule: RecurringRule) => {
    setForm({
      id: rule.id,
      amount: String(rule.amount),
      category: rule.category,
      description: rule.description ?? '',
      direction: rule.direction,
      cadence: rule.cadence,
      dayOfMonth: rule.dayOfMonth ? String(rule.dayOfMonth) : '',
      weekday: rule.weekday ? String(rule.weekday) : '',
      startDate: rule.startDate.slice(0, 10),
      endDate: rule.endDate ? rule.endDate.slice(0, 10) : '',
      paymentSource: rule.paymentSource ?? 'sg',
    });
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/recurring?id=${id}`, { method: 'DELETE' });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(payload?.error ?? 'Erreur lors de la suppression');
      return;
    }
    if (form.id === id) setForm(defaultForm);
    await refresh();
  };

  const cadenceLabel = (cadence: RecurringRule['cadence']) => {
    switch (cadence) {
      case 'weekly':
        return 'Hebdo';
      case 'monthly':
        return 'Mensuel';
      case 'quarterly':
        return 'Trimestriel';
      case 'yearly':
        return 'Annuel';
      default:
        return cadence;
    }
  };

  const computeNextCycleTotal = (instances: RecurringInstance[], summaries?: RecurringMonthSummary[]) => {
    // Si on dispose des summaries (forecast), on ne garde que les charges SG du mois à venir
    // pour l'affichage "Charges prévues (prochain mois)".
    if (summaries?.length) {
      return summaries[0]?.sgChargesTotal ?? summaries[0]?.expenses ?? 0;
    }
    if (!instances.length) return 0;
    const sorted = [...instances].sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
    const firstMonth = sorted[0].dueDate.slice(0, 7); // YYYY-MM
    return sorted
      .filter(
        (instance) =>
          instance.direction === 'expense' &&
          instance.category !== 'floa_bank' &&
          instance.dueDate.slice(0, 7) === firstMonth,
      )
      .reduce((sum, instance) => sum + instance.amount, 0);
  };

  useEffect(() => {
    setTotal(computeNextCycleTotal(upcoming, monthSummaries));
  }, [upcoming, monthSummaries]);

  // Total des remboursements/charges différées pour le mois à venir (floa_bank).
  const deferredNextMonth = useMemo(() => {
    if (monthSummaries.length) {
      return monthSummaries[0]?.floaRepaymentsTotal ?? monthSummaries[0]?.carryover ?? 0;
    }
    if (!upcoming.length) return 0;
    const sorted = [...upcoming].sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
    const firstMonth = sorted[0].dueDate.slice(0, 7);
    return sorted
      .filter((instance) => instance.category === 'floa_bank' && instance.dueDate.slice(0, 7) === firstMonth)
      .reduce((sum, instance) => sum + instance.amount, 0);
  }, [upcoming, monthSummaries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm font-semibold text-white">Outils de test</p>
          <p className="text-xs text-slate-400">
            Déclenche le job récurrent (service role) pour un mois choisi ou purge toutes les transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200">
            Mois cible
            <input
              type="month"
              value={runMonth}
              onChange={(e) => setRunMonth(e.target.value)}
              className="rounded bg-slate-900 px-2 py-1 text-white"
            />
          </label>
          <button
            type="button"
            onClick={handleRunRecurring}
            disabled={runningJob}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {runningJob ? 'Génération…' : 'Générer récurrents'}
          </button>
          <button
            type="button"
            onClick={handlePurgeTransactions}
            disabled={purging}
            className="rounded bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {purging ? 'Suppression…' : 'Supprimer toutes les transactions'}
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Charges prévues (prochain mois)</p>
            <span className="text-lg font-semibold text-white">{total.toFixed(2)}€</span>
          </div>
          <p className="text-xs text-slate-500">Somme des échéances du mois à venir</p>
        </div>
        <div className="rounded-2xl border border-amber-700/60 bg-amber-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-100">Différé (prochain mois)</p>
            <span className="text-lg font-semibold text-amber-50">{deferredNextMonth.toFixed(2)}€</span>
          </div>
          <p className="text-xs text-amber-200/80">Remboursements Floa / charges différées du mois à venir</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
        >
          {showForm ? 'Masquer le formulaire' : 'Ajouter / éditer'}
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
          {viewMode === 'list' ? (
            <button
              type="button"
              onClick={() => setShowRulesTable((prev) => !prev)}
              className="rounded border border-slate-700 bg-slate-900/60 px-3 py-1 text-slate-200"
            >
              {showRulesTable ? 'Masquer le tableau' : 'Afficher le tableau'}
            </button>
          ) : null}
        </div>
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">{isEditing ? 'Modifier une charge fixe' : 'Ajouter une charge fixe'}</p>
            {isEditing ? (
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
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-slate-400">Aide rapide :</span>
            <button
              type="button"
              onClick={handleAddSalaryPreset}
              className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/20"
            >
              Préremplir Salaire (revenu mensuel)
            </button>
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
              Type
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.direction}
                onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value as RecurringRule['direction'] }))}
              >
                <option value="expense">Charge</option>
                <option value="income">Revenu (salaire)</option>
              </select>
            </label>
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
              Description
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Abonnement internet"
              />
            </label>
            <div className="flex flex-col gap-1 text-sm text-slate-300">
              Source de paiement
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded border px-3 py-2 text-sm ${
                    form.paymentSource === 'sg'
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
                      : 'border-slate-700 bg-slate-800 text-slate-200'
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, paymentSource: 'sg' }))}
                >
                  SG (immédiat)
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded border px-3 py-2 text-sm ${
                    form.paymentSource === 'floa'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-100'
                      : 'border-slate-700 bg-slate-800 text-slate-200'
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, paymentSource: 'floa' }))}
                >
                  Floa (paiement différé)
                </button>
              </div>
              <p className="text-xs text-amber-300">
                Floa décale la charge au mois suivant et crée un remboursement.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Récurrence
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.cadence}
                onChange={(e) => setForm((prev) => ({ ...prev, cadence: e.target.value as RecurringRule['cadence'] }))}
              >
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
                <option value="quarterly">Trimestrielle</option>
                <option value="yearly">Annuelle</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Jour du mois (optionnel)
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="number"
                min="1"
                max="28"
                value={form.dayOfMonth}
                onChange={(e) => setForm((prev) => ({ ...prev, dayOfMonth: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Jour de semaine (0-6 optionnel)
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="number"
                min="0"
                max="6"
                value={form.weekday}
                onChange={(e) => setForm((prev) => ({ ...prev, weekday: e.target.value }))}
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
            {loading ? 'Enregistrement...' : isEditing ? 'Mettre à jour' : 'Ajouter'}
          </button>
        </form>
      ) : null}

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-300">{rule.description || rule.category}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase text-slate-500">{cadenceLabel(rule.cadence)}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      rule.paymentSource === 'floa'
                        ? 'bg-amber-500/20 text-amber-100'
                        : 'bg-emerald-500/20 text-emerald-100'
                    }`}
                  >
                    {rule.paymentSource === 'floa' ? 'Floa différé' : 'SG'}
                  </span>
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold text-white">{rule.amount.toFixed(2)}€</div>
              <p className="text-xs text-slate-500">
                Début: {rule.startDate.slice(0, 10)} {rule.endDate ? `• Fin: ${rule.endDate.slice(0, 10)}` : ''}
              </p>
              <div className="mt-3 flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    handleEdit(rule);
                    setShowForm(true);
                  }}
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
            </div>
          ))}
        </div>
      ) : showRulesTable ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Paiement</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Début</th>
                <th className="px-4 py-3">Fin</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-200">{rule.description || '—'}</td>
                  <td className="px-4 py-3 text-slate-200">{rule.category}</td>
                  <td className="px-4 py-3 text-slate-200">{rule.amount.toFixed(2)}€</td>
                  <td className="px-4 py-3 text-slate-200">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        rule.paymentSource === 'floa'
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'bg-emerald-500/15 text-emerald-100'
                      }`}
                    >
                      {rule.paymentSource === 'floa' ? 'Floa (différé)' : 'SG'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{cadenceLabel(rule.cadence)}</td>
                  <td className="px-4 py-3 text-slate-200">{rule.startDate.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-200">{rule.endDate ? rule.endDate.slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleEdit(rule);
                          setShowForm(true);
                        }}
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
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          Tableau masqué. Cliquez sur "Afficher le tableau" pour le revoir.
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-300">Échéances à venir ({RECURRING_LOOKAHEAD_MONTHS} mois)</p>
        </div>
        <div className="mt-2 space-y-3">
          {groupedByYear.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune échéance à afficher.</p>
          ) : (
            groupedByYear.map(({ year, months }) => {
              const yearTotal = months
                .reduce((sum, entry) => {
                  const summary = summaryByMonth.get(entry.month);
                  if (summary) return sum + summary.totalWithCarryover;
                  return (
                    sum +
                    entry.instances.reduce(
                      (s, i) => (i.direction === 'income' || i.category === 'floa_bank' ? s : s + i.amount),
                      0,
                    )
                  );
                }, 0)
                .toFixed(2);
              const isYearExpanded = expandedYears[year] ?? false;
              return (
                <div key={year} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setExpandedYears((prev) => ({ ...prev, [year]: !isYearExpanded }))}
                    className="flex w-full items-center justify-between bg-gradient-to-r from-slate-800/70 via-slate-900/60 to-slate-950/80 px-4 py-3 text-left text-sm font-semibold text-white"
                  >
                    <span>{year}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      {yearTotal}€ <span>{isYearExpanded ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {isYearExpanded ? (
                    <div className="divide-y divide-slate-800">
                      {months.map(({ month, instances }, idx) => {
                        const summary = summaryByMonth.get(month);
                        const expensesTotal = summary
                          ? summary.expenses
                          : instances.reduce(
                              (sum, i) => (i.direction === 'income' || i.category === 'floa_bank' ? sum : sum + i.amount),
                              0,
                            );
                        const carryoverValue = summary?.carryover ?? 0;
                        const overdraftRemaining = summary?.overdraftRemaining ?? null;
                        const monthTotal = (summary?.totalWithCarryover ?? expensesTotal).toFixed(2);
                        const isExpanded = expandedMonths[month] ?? false;
                        const gradient = MONTH_GRADIENTS[idx % MONTH_GRADIENTS.length];
                        const badgeClass = MONTH_BADGES[idx % MONTH_BADGES.length];
                        return (
                          <div key={month} className="text-sm">
                            <button
                              type="button"
                              onClick={() => setExpandedMonths((prev) => ({ ...prev, [month]: !isExpanded }))}
                              className={`flex w-full items-center justify-between border-l-4 border-transparent bg-gradient-to-r px-4 py-2 text-left text-slate-100 transition hover:border-slate-500 ${gradient}`}
                            >
                              <span className="font-semibold capitalize">
                                {new Date(`${month}-01`).toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-slate-200">
                                {monthTotal}€ <span>{isExpanded ? '▲' : '▼'}</span>
                              </span>
                            </button>
                            <div className="flex flex-wrap items-center gap-3 border-b border-slate-800/60 bg-slate-900/70 px-4 py-2 text-[13px] text-slate-200">
                              <span className="text-slate-300">Charges fixes SG: {expensesTotal.toFixed(2)}€</span>
                              <span className="text-amber-200">
                                Remb. Floa: {(summary?.floaRepaymentsTotal ?? summary?.carryover ?? 0).toFixed(2)}€
                              </span>
                              <span className="text-emerald-200">Revenus fixes: {(summary?.income ?? 0).toFixed(2)}€</span>
                              <span className="text-slate-200">
                                Découvert entrant: {(summary?.overdraftIncoming ?? carryoverValue).toFixed(2)}€
                              </span>
                              <span className="font-semibold text-white">Total mois: {monthTotal}€</span>
                              <span
                                className={`font-semibold ${
                                  (summary?.finalBalance ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
                                }`}
                              >
                                Solde: {(summary?.finalBalance ?? monthTotal * -1).toFixed(2)}€
                              </span>
                              {overdraftRemaining !== null ? (
                                <span className="text-slate-400">
                                  Découvert suivant: {overdraftRemaining.toFixed(2)}€
                                </span>
                              ) : null}
                            </div>
                            {isExpanded ? (
                              <div className="divide-y divide-slate-800 bg-slate-900/60 text-slate-200">
                                {instances.map((instance) => (
                                  <div
                                    key={`${instance.ruleId}-${instance.dueDate}`}
                                    className={`flex items-center justify-between px-4 py-2 ${
                                      instance.kind === 'carryover' || instance.category === 'floa_bank'
                                        ? 'bg-red-900/10'
                                        : ''
                                    }`}
                                  >
                                    <div className="space-y-1">
                                      <p
                                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                          instance.kind === 'carryover'
                                            ? 'bg-red-900/40 text-red-100 ring-1 ring-red-500/40'
                                            : instance.category === 'floa_bank'
                                              ? 'bg-amber-900/40 text-amber-100 ring-1 ring-amber-500/30'
                                              : instance.direction === 'income'
                                                ? 'bg-emerald-900/40 text-emerald-100 ring-1 ring-emerald-500/30'
                                                : badgeClass
                                        }`}
                                      >
                                        <span
                                          className={`inline-block h-2 w-2 rounded-full ${
                                            instance.kind === 'carryover'
                                              ? 'bg-red-300'
                                              : instance.category === 'floa_bank'
                                                ? 'bg-amber-300'
                                                : 'bg-white/70'
                                          }`}
                                        />
                                        {instance.category === 'floa_bank'
                                          ? 'Remboursement Floa'
                                          : instance.description || instance.category}
                                      </p>
                                      <p className="text-xs text-slate-500">{instance.dueDate.slice(0, 10)}</p>
                                    </div>
                                    <span
                                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        instance.kind === 'carryover'
                                          ? 'bg-red-900/60 text-red-100 ring-1 ring-red-500/40'
                                          : instance.category === 'floa_bank'
                                            ? 'bg-amber-900/60 text-amber-100 ring-1 ring-amber-500/40'
                                            : instance.direction === 'income'
                                              ? 'bg-emerald-900/60 text-emerald-100 ring-1 ring-emerald-500/30'
                                              : 'bg-slate-800/60 text-indigo-100'
                                      }`}
                                    >
                                      {instance.amount.toFixed(2)}€
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
