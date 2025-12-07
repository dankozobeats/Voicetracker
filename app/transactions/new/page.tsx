// -------------------------------------------
// Page client : création manuelle d'une transaction (formulaire complet)
// -------------------------------------------
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { toast } from '@/components/ui/use-toast';

// -------------------------------------------
// Schéma Zod pour valider localement les données du formulaire
// -------------------------------------------
const transactionSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['income', 'expense', 'transfer']),
  category_id: z.string().uuid(),
  description: z.string().max(240).optional(),
  date: z.string().min(1),
});

// -------------------------------------------
// Typage des catégories récupérées via Supabase (nom + icône + couleur)
// -------------------------------------------
type CategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

// -------------------------------------------
// Composant principal : form de création
// -------------------------------------------
export default function NewTransactionPage() {
  // -------------------------------------------
  // State formulaire contrôlé pour refléter les inputs
  // -------------------------------------------
  const [form, setForm] = useState({
    amount: '',
    type: 'expense',
    category_id: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
  });

  // -------------------------------------------
  // Liste des catégories pour alimenter le select
  // -------------------------------------------
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // -------------------------------------------
  // État de chargement pour désactiver les boutons pendant l'insert
  // -------------------------------------------
  const [loading, setLoading] = useState(false);

  // -------------------------------------------
  // Router Next pour rediriger après succès
  // -------------------------------------------
  const router = useRouter();

  // -------------------------------------------
  // Client Supabase côté client (App Router) pour les requêtes mutatives
  // -------------------------------------------
  const supabase = createClientComponentClient();

  // -------------------------------------------
  // Charge les catégories dès le montage pour éviter un form vide
  // -------------------------------------------
  useEffect(() => {
    const loadCategories = async () => {
      // -------------------------------------------
      // Récupère id/nom/icône/couleur pour styliser le badge plus tard
      // -------------------------------------------
      const { data, error } = await supabase.from('categories').select('id, name, icon, color').order('name');
      if (!error && data) {
        setCategories(data as CategoryOption[]);
      }
    };
    loadCategories().catch(() => undefined);
  }, [supabase]);

  // -------------------------------------------
  // Gestion de la soumission du formulaire
  // -------------------------------------------
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    // -------------------------------------------
    // Validation client : évite un aller-retour si les données sont invalides
    // -------------------------------------------
    const parsed = transactionSchema.safeParse({
      amount: Number(form.amount),
      type: form.type,
      category_id: form.category_id,
      description: form.description || undefined,
      date: form.date,
    });

    if (!parsed.success) {
      toast({
        title: 'Validation',
        description: parsed.error.errors[0]?.message ?? 'Champs invalides',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // -------------------------------------------
    // Insert Supabase : profite du RLS et enregistre la transaction
    // -------------------------------------------
    const { error } = await supabase.from('transactions').insert({
      amount: parsed.data.amount,
      type: parsed.data.type,
      category_id: parsed.data.category_id,
      description: parsed.data.description ?? null,
      date: parsed.data.date,
    });

    if (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de créer la transaction',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // -------------------------------------------
    // Succès : toast utilisateur + redirection vers la liste
    // -------------------------------------------
    toast({ title: 'Succès', description: 'Transaction créée' });
    router.push('/transactions');
  };

  return (
    <div className="space-y-6 p-6">
      {/* ------------------------------------------- */}
      {/* Titre de page pour contextualiser l’action */}
      {/* ------------------------------------------- */}
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Transactions</p>
        <h1 className="text-xl font-semibold text-white">Nouvelle transaction</h1>
        <p className="text-sm text-slate-400">Ajoutez un revenu, une dépense ou un transfert manuellement.</p>
      </div>

      {/* ------------------------------------------- */}
      {/* Formulaire shadcn-like : inputs alignés, labels clairs */}
      {/* ------------------------------------------- */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <label className="flex flex-col gap-1 text-sm text-slate-200 md:col-span-2">
            Catégorie
            <select
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
              required
              value={form.category_id}
              onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
            >
              <option value="">Sélectionner…</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon ?? '•'} {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-200 md:col-span-2">
            Description
            <input
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white"
              type="text"
              placeholder="(optionnel)"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
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
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-indigo-600 px-4 py-2 text-white font-semibold disabled:opacity-60"
          >
            {loading ? 'Enregistrement...' : 'Créer'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/transactions')}
            className="rounded border border-slate-700 px-4 py-2 text-slate-200"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
