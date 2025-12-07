import type { DashboardSnapshot } from '@/models/insights';

/**
 * Reusable cards summarizing the main dashboard KPIs.
 * Pure UI, consumes precomputed snapshot data.
 */
export default function DashboardCards({ snapshot }: { snapshot: DashboardSnapshot }) {
  const changePercent = (snapshot.monthlyChange * 100).toFixed(1);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-400">Dépenses du mois</p>
        <div className="mt-2 text-3xl font-bold text-white">{snapshot.currentMonthTotal.toFixed(2)}€</div>
        <p className="text-xs text-slate-500">Inclut charges fixes: {snapshot.totalFixedCharges.toFixed(2)}€</p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-400">Variation mensuelle</p>
        <div className="mt-2 text-3xl font-bold text-white">{changePercent}%</div>
        <p className="text-xs text-slate-500">Référence: {snapshot.previousMonthTotal.toFixed(2)}€</p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-400">Transactions suivies</p>
        <div className="mt-2 text-3xl font-bold text-white">{snapshot.transactions.length}</div>
        <p className="text-xs text-slate-500">Période: {snapshot.monthlyTotals[0]?.month ?? 'n/a'}</p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-400">Catégories à surveiller</p>
        <div className="mt-2 text-3xl font-bold text-white">{snapshot.budgetUsage.filter((b) => b.status !== 'ok').length}</div>
        <p className="text-xs text-slate-500">Basé sur alertThreshold</p>
      </div>
    </div>
  );
}
