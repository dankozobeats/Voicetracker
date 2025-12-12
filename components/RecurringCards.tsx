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
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-slate-500">{rule.cadence}</span>
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
            <p className="text-xs text-slate-500">Début: {rule.startDate.slice(0, 10)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm font-medium text-slate-300">Échéances à venir</p>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.slice(0, 6).map((instance) => (
            <div key={`${instance.ruleId}-${instance.dueDate}`} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">{instance.description || instance.category}</p>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    instance.category === 'floa_bank'
                      ? 'bg-amber-500/20 text-amber-100'
                      : 'bg-emerald-500/20 text-emerald-100'
                  }`}
                >
                  {instance.category === 'floa_bank' ? 'Remb. Floa' : 'SG'}
                </span>
              </div>
              <p className="text-xs text-slate-500">{instance.dueDate.slice(0, 10)}</p>
              <p
                className={`text-sm font-semibold ${
                  instance.category === 'floa_bank' ? 'text-amber-200' : 'text-indigo-200'
                }`}
              >
                {instance.amount.toFixed(2)}€
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
