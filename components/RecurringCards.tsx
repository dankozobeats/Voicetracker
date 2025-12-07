import type { RecurringInstance, RecurringRule } from '@/models/recurring';

interface RecurringCardsProps {
  rules: RecurringRule[];
  upcoming: RecurringInstance[];
  total: number;
}

/**
 * Display recurring rules alongside upcoming instances.
 */
export default function RecurringCards({ rules, upcoming, total }: RecurringCardsProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-300">Charges prévues</p>
          <span className="text-lg font-semibold text-white">{total.toFixed(2)}€</span>
        </div>
        <p className="text-xs text-slate-500">Projection sur la période sélectionnée</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-300">{rule.description || rule.category}</p>
              <span className="text-xs uppercase text-slate-500">{rule.cadence}</span>
            </div>
            <div className="mt-3 text-2xl font-bold text-white">{rule.amount.toFixed(2)}€</div>
            <p className="text-xs text-slate-500">Début: {rule.startDate.slice(0, 10)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-medium text-slate-300">Échéances à venir</p>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.slice(0, 6).map((instance) => (
            <div key={`${instance.ruleId}-${instance.dueDate}`} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-sm text-white">{instance.description || instance.category}</p>
              <p className="text-xs text-slate-500">{instance.dueDate.slice(0, 10)}</p>
              <p className="text-sm font-semibold text-indigo-200">{instance.amount.toFixed(2)}€</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
