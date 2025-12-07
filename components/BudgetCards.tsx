import type { BudgetProjection, BudgetUsage } from '@/models/budget';

interface BudgetCardsProps {
  usage: BudgetUsage[];
  projections: BudgetProjection[];
}

/**
 * Reusable cards for budget consumption and projections.
 */
export default function BudgetCards({ usage, projections }: BudgetCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {usage.map((entry) => {
        const projection = projections.find((p) => p.category === entry.category);
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
            <div className="mt-3 text-2xl font-bold text-white">{entry.spent.toFixed(2)}€ / {entry.limit.toFixed(2)}€</div>
            <p className="text-xs text-slate-500">Seuil d&apos;alerte: {(entry.threshold * 100).toFixed(0)}%</p>
            {projection ? (
              <p className="mt-2 text-sm text-slate-400">
                Projection: {projection.projectedSpend.toFixed(2)}€ ({projection.overrunDelta > 0 ? 'dépassement' : 'ok'})
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
