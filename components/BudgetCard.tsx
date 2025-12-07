'use client';

// -------------------------------------------
// Carte de budget : affiche progression + actions éditer/supprimer
// -------------------------------------------
import type { BudgetWithUsage } from '@/types/budget';

type BudgetCardProps = {
  budget: BudgetWithUsage;
  depth?: number;
  onEdit: (budget: BudgetWithUsage) => void;
  onDelete: (id: string) => Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
};

/**
 * Calcul d'une couleur lisible en fonction du % restant.
 * @param progress - ratio dépensé
 */
const computeBadgeColor = (progress: number) => {
  if (progress >= 1) return 'bg-rose-600/20 text-rose-100';
  if (progress >= 0.8) return 'bg-amber-500/20 text-amber-100';
  return 'bg-emerald-600/20 text-emerald-100';
};

/**
 * Carte affichant un budget (master ou enfant).
 */
export default function BudgetCard({ budget, depth = 0, onEdit, onDelete, collapsed, onToggleCollapse }: BudgetCardProps) {
  // Calcul de la largeur de la barre de progression
  const progressPercent = Math.min(Math.max(budget.progress * 100, 0), 100);
  const badgeColor = computeBadgeColor(budget.progress);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {budget.isMaster ? 'Budget principal' : `Sous-budget · niveau ${depth}`}
          </p>
          <h3 className="text-lg font-semibold text-white">{budget.name}</h3>
          {budget.category ? <p className="text-xs text-slate-400">Catégorie: {budget.category}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {typeof collapsed === 'boolean' ? (
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
              onClick={() => onToggleCollapse?.(budget.id)}
            >
              {collapsed ? 'Déployer' : 'Réduire'}
            </button>
          ) : null}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeColor}`}>
            {budget.remaining.toFixed(2)}€ restants
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-1 text-sm text-slate-300">
        <p>
          Montant initial: <span className="font-semibold text-white">{budget.amount.toFixed(2)}€</span>
        </p>
        <p>
          Dépensé: <span className="font-semibold text-white">{budget.spent.toFixed(2)}€</span>
        </p>
        <p>
          Restant: <span className="font-semibold text-white">{budget.remaining.toFixed(2)}€</span>
        </p>
      </div>

      <div className="mt-4 h-2 rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-slate-200 hover:border-slate-500"
          onClick={() => onEdit(budget)}
        >
          Éditer
        </button>
        <button
          type="button"
          className="rounded-lg bg-rose-600 px-3 py-1 text-white hover:bg-rose-500"
          onClick={() => onDelete(budget.id)}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
