// -------------------------------------------
// Tableau des transactions avec badges, suppression et feedback toast
// -------------------------------------------
'use client';

import { useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import type { Transaction } from '@/models/transaction';
import { toast } from '@/components/ui/use-toast';
import { useEffect } from 'react';

// -------------------------------------------
// Styles de badges par type pour une lecture rapide
// -------------------------------------------
const typeStyles: Record<string, string> = {
  income: 'bg-emerald-500/20 text-emerald-100',
  expense: 'bg-rose-500/20 text-rose-100',
  transfer: 'bg-slate-600/40 text-slate-100',
};

interface TransactionTableProps {
  transactions: Transaction[];
}

// -------------------------------------------
// Composant principal : UI moderne + interactions (delete)
// -------------------------------------------
export default function TransactionTable({ transactions }: TransactionTableProps) {
  // -------------------------------------------
  // State local pour refléter les mutations (suppression) sans recharger la page
  // -------------------------------------------
  const [items, setItems] = useState(transactions);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  // -------------------------------------------
  // State pour l'édition : ligne en cours + valeurs du formulaire
  // -------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: '',
    type: 'expense',
    category_id: '',
    description: '',
    date: '',
  });
  // -------------------------------------------
  // Liste des catégories pour alimenter le sélecteur dans le formulaire d'édition
  // -------------------------------------------
  const [categories, setCategories] = useState<
    { id: string; name: string; icon: string | null; color: string | null }[]
  >([]);
  // -------------------------------------------
  // État de chargement pour désactiver les actions pendant l'update
  // -------------------------------------------
  const [loading, setLoading] = useState(false);

  // -------------------------------------------
  // Client Supabase pour les actions mutatives (delete)
  // -------------------------------------------
  const supabase = createClientComponentClient();

  // -------------------------------------------
  // État dérivé pour afficher un message vide si nécessaire
  // -------------------------------------------
  const isEmpty = useMemo(() => items.length === 0, [items]);
  const allSelected = useMemo(() => items.length > 0 && selectedIds.size === items.length, [items, selectedIds]);
  const someSelected = useMemo(() => selectedIds.size > 0, [selectedIds]);
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    items.forEach((tx) => {
      const monthKey = tx.date.slice(0, 7);
      if (!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey)!.push(tx);
    });
    const formatMonth = (key: string) => {
      const safe = `${key}-01`;
      const parsed = new Date(safe);
      return Number.isNaN(parsed.getTime())
        ? key
        : parsed.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    };
    return Array.from(map.entries())
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .map(([key, rows]) => {
        const sorted = rows.sort((a, b) => (a.date > b.date ? -1 : 1));
        const summary = sorted.reduce(
          (acc, tx) => {
            const amount = Number(tx.amount) || 0;
            const type = tx.type ?? 'expense';
            const metadata = (tx as any).metadata as Record<string, unknown> | undefined;
            const isRecurring = Boolean(metadata && (metadata.recurringRuleId || metadata.carryoverFrom));
            const isBudgeted = Boolean((tx as any).budgetId);

            if (type === 'income') {
              acc.income += amount;
            } else if (type === 'expense') {
              // Ignore dépenses déjà imputées à un budget, sauf charges fixes (recurring/carryover).
              if (isBudgeted && !isRecurring) {
                return acc;
              }
              acc.expense += amount;
            }
            acc.net = acc.income - acc.expense;
            acc.count += 1;
            return acc;
          },
          { income: 0, expense: 0, net: 0, count: 0 },
        );
        return {
          key,
          label: formatMonth(key),
          rows: sorted,
          summary,
        };
      });
  }, [items]);

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // -------------------------------------------
  // Charge les catégories au montage pour proposer la liste dans l'éditeur
  // -------------------------------------------
  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase.from('categories').select('id, name, icon, color').order('name');
      if (!error && data) {
        setCategories(data);
      } else {
        // -------------------------------------------
        // Fallback : catégories par défaut si la table est vide ou indisponible
        // -------------------------------------------
        setCategories([
          { id: 'restaurant', name: 'restaurant', icon: '🍽️', color: '#f97316' },
          { id: 'courses', name: 'courses', icon: '🛒', color: '#10b981' },
          { id: 'transport', name: 'transport', icon: '🚌', color: '#3b82f6' },
          { id: 'loisirs', name: 'loisirs', icon: '🎉', color: '#8b5cf6' },
          { id: 'santé', name: 'santé', icon: '💊', color: '#ef4444' },
          { id: 'shopping', name: 'shopping', icon: '🛍️', color: '#eab308' },
          { id: 'autre', name: 'autre', icon: '•', color: '#94a3b8' },
        ]);
      }
    };
    loadCategories().catch(() => undefined);
  }, [supabase]);

  // -------------------------------------------
  // Ouvre le formulaire d'édition avec les valeurs de la ligne sélectionnée
  // -------------------------------------------
  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      amount: tx.amount.toString(),
      type: tx.type ?? 'expense',
      category_id: tx.categoryInfo?.id ?? '',
      description: tx.description ?? '',
      date: tx.date.slice(0, 10),
    });
  };

  // -------------------------------------------
  // Suppression d'une transaction : appel Supabase + mise à jour locale + toast
  // -------------------------------------------
  const handleDelete = async (id: string) => {
    // -------------------------------------------
    // Appel Supabase : supprime la ligne (protégé par RLS côté base)
    // -------------------------------------------
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) {
      toast({
        title: 'Erreur',
        description: 'Suppression impossible',
        variant: 'destructive',
      });
      return;
    }

    // -------------------------------------------
    // Mise à jour locale pour feedback immédiat
    // -------------------------------------------
    setItems((prev) => prev.filter((row) => row.id !== id));

    // -------------------------------------------
    // Confirmation à l'utilisateur via toast
    // -------------------------------------------
    toast({
      title: 'Supprimée',
      description: 'La transaction a été supprimée',
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    if (error) {
      toast({
        title: 'Erreur',
        description: 'Suppression multiple impossible',
        variant: 'destructive',
      });
      return;
    }
    setItems((prev) => prev.filter((row) => !selectedIds.has(row.id)));
    setSelectedIds(new Set());
    toast({ title: 'Supprimées', description: 'Transactions supprimées' });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // -------------------------------------------
  // Enregistrement d'une modification : update Supabase + mise à jour locale
  // -------------------------------------------
  const handleSave = async () => {
    if (!editingId) return;
    setLoading(true);

    // -------------------------------------------
    // Requête Supabase commentée : met à jour la transaction ciblée
    // -------------------------------------------
    const { error } = await supabase
      .from('transactions')
      .update({
        amount: Number(form.amount),
        type: form.type,
        category_id: form.category_id || null,
        description: form.description || null,
        date: form.date,
      })
      .eq('id', editingId);

    if (error) {
      toast({
        title: 'Erreur',
        description: 'Mise à jour impossible',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // -------------------------------------------
    // Récupère l'info catégorie choisie pour mettre à jour le badge localement
    // -------------------------------------------
    const categoryInfo = categories.find((c) => c.id === form.category_id) ?? null;

    // -------------------------------------------
    // Met à jour l'élément en mémoire pour refléter immédiatement l'édition
    // -------------------------------------------
    setItems((prev) =>
      prev.map((row) =>
        row.id === editingId
          ? {
              ...row,
              amount: Number(form.amount),
              type: form.type as Transaction['type'],
              description: form.description || null,
              date: form.date,
              categoryInfo,
            }
          : row,
      ),
    );

    // -------------------------------------------
    // Ferme le mode édition et notifie l'utilisateur
    // -------------------------------------------
    setEditingId(null);
    setLoading(false);
    toast({ title: 'Enregistré', description: 'Transaction mise à jour' });
  };

  // -------------------------------------------
  // Annule l'édition et réinitialise le formulaire
  // -------------------------------------------
  const handleCancel = () => {
    setEditingId(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
      {/* ------------------------------------------- */}
      {/* Sous-titre compact juste au-dessus du tableau (non sticky pour ne pas masquer l'en-tête) */}
      {/* ------------------------------------------- */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
        <span>Liste des transactions</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-500"
              checked={allSelected}
              onChange={toggleAll}
              disabled={isEmpty}
            />
            Tout sélectionner
          </label>
          <button
            type="button"
            className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
            onClick={handleBulkDelete}
            disabled={!someSelected}
          >
            Supprimer la sélection
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-500"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={isEmpty}
                />
              </th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          {groupedByMonth.map((group) => (
            <tbody key={group.key} className="divide-y divide-slate-800">
              <tr className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                <td colSpan={7} className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left text-slate-200 hover:text-white"
                      onClick={() => toggleMonth(group.key)}
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[10px]"
                        aria-label={collapsedMonths.has(group.key) ? 'Déplier' : 'Réduire'}
                      >
                        {collapsedMonths.has(group.key) ? '+' : '−'}
                      </span>
                      {group.label}
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] lowercase text-slate-200">
                        {group.summary.count} op.
                      </span>
                    </button>
                    <div className="flex items-center gap-3 text-[11px] text-slate-200">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-200">
                        +{group.summary.income.toFixed(2)}€
                      </span>
                      <span className="rounded-full bg-rose-500/15 px-2 py-1 text-rose-200">
                        −{group.summary.expense.toFixed(2)}€
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${
                          group.summary.net >= 0 ? 'bg-emerald-500/15 text-emerald-100' : 'bg-rose-500/15 text-rose-100'
                        }`}
                      >
                        Net {group.summary.net.toFixed(2)}€
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
              {!collapsedMonths.has(group.key)
                ? group.rows.map((tx) => {
                  // -------------------------------------------
                  // Badge type coloré : renforce la hiérarchie visuelle
                  // -------------------------------------------
                  const badgeClass = typeStyles[tx.type ?? 'expense'] ?? typeStyles.expense;

                  // -------------------------------------------
                  // Badge catégorie : couleur translucide + icône pour repère rapide
                  // -------------------------------------------
                  const categoryBadge = tx.categoryInfo ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${tx.categoryInfo.color ?? '#64748b'}22`,
                        color: tx.categoryInfo.color ?? '#cbd5e1',
                      }}
                    >
                      {tx.categoryInfo.icon ?? '•'} {tx.categoryInfo.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Non catégorisé</span>
                  );

                  const formattedDateTime = (() => {
                    const parsed = new Date(tx.date);
                    if (Number.isNaN(parsed.getTime())) return tx.date.slice(0, 10);
                    return parsed.toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                  })();

                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-500"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleOne(tx.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-200">{formattedDateTime}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badgeClass}`}>
                          {tx.type ?? 'expense'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{categoryBadge}</td>
                      <td className="px-4 py-3 text-slate-300">{tx.description || '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-bold">{tx.amount.toFixed(2)}€</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {/* ------------------------------------------- */}
                          {/* Bouton Éditer : ouvre le formulaire inline */}
                          {/* ------------------------------------------- */}
                          <button
                            type="button"
                            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-100 hover:bg-slate-700"
                            onClick={() => handleEdit(tx)}
                          >
                            Éditer
                          </button>
                          {/* ------------------------------------------- */}
                          {/* Bouton Supprimer : déclenche handleDelete avec feedback toast */}
                          {/* ------------------------------------------- */}
                          <button
                            type="button"
                            className="rounded bg-rose-600 px-3 py-1 text-xs text-white hover:bg-rose-500"
                            onClick={() => handleDelete(tx.id)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
                : null}

            {/* ------------------------------------------- */}
            {/* État vide : message centré si aucune transaction */}
            {/* ------------------------------------------- */}
              {isEmpty ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aucune transaction pour le moment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          ))}
        </table>
      </div>

      {/* ------------------------------------------- */}
      {/* Formulaire d'édition inline sous le tableau */}
      {/* ------------------------------------------- */}
      {editingId ? (
        <div className="border-t border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Modifier la transaction</p>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-slate-400 underline"
              disabled={loading}
            >
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Montant
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Type
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
                <option value="transfer">Transfert</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Catégorie
              <select
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                value={form.category_id}
                onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
              >
                <option value="">Non catégorisé</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon ?? '•'} {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Date
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200 md:col-span-1">
              Description
              <input
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                type="text"
                placeholder="(optionnel)"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="rounded bg-indigo-600 px-4 py-2 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
