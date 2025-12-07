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
      <div className="border-b border-slate-800 px-4 py-3 text-sm text-slate-400">Liste des transactions</div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((tx) => {
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

              return (
                <tr key={tx.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-slate-200">{tx.date.slice(0, 10)}</td>
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
            })}

            {/* ------------------------------------------- */}
            {/* État vide : message centré si aucune transaction */}
            {/* ------------------------------------------- */}
            {isEmpty ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Aucune transaction pour le moment.
                </td>
              </tr>
            ) : null}
          </tbody>
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
