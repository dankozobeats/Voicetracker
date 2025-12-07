import type { Insight } from '@/models/insights';

interface InsightCardsProps {
  insights: Insight[];
}

/**
 * Present a list of AI insights in card format.
 */
export default function InsightCards({ insights }: InsightCardsProps) {
  if (!insights.length) {
    return <p className="text-sm text-slate-400">Aucun insight disponible pour le moment.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {insights.map((insight) => (
        <div key={insight.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs uppercase text-slate-500">
            <span>{insight.type}</span>
            {insight.severity ? <span className="font-semibold text-rose-200">{insight.severity}</span> : null}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{insight.title}</h3>
          <p className="text-sm text-slate-300">{insight.detail}</p>
          {insight.category ? <p className="text-xs text-slate-500">Catégorie: {insight.category}</p> : null}
        </div>
      ))}
    </div>
  );
}
