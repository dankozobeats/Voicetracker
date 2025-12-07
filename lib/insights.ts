import type { BudgetProjection, BudgetUsage } from '@/models/budget';
import { RECURRING_LOOKAHEAD_MONTHS } from '@/models/recurring';
import type { DashboardSnapshot, Insight } from '@/models/insights';
import type { MonthlyTotal, Transaction } from '@/models/transaction';
import { handleServiceError } from '@/lib/utils';

/**
 * Service to derive insights from transactional data.
 */
export class InsightService {
  /**
   * Detect spending patterns such as dominant categories.
   * @param transactions - list of scoped transactions
   * @returns - insights highlighting patterns
   */
  detectPatterns(transactions: Transaction[]): Insight[] {
    try {
      const byCategory = new Map<string, number>();
      transactions.forEach((tx) => {
        const current = byCategory.get(tx.category) ?? 0;
        byCategory.set(tx.category, current + tx.amount);
      });

      const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
      const topCategory = sorted[0];

      if (!topCategory) return [];

      return [
        {
          id: crypto.randomUUID(),
          type: 'pattern',
          title: 'Catégorie dominante',
          detail: `${topCategory[0]} représente ${topCategory[1].toFixed(2)}€ ce mois-ci`,
          category: topCategory[0],
          createdAt: new Date().toISOString(),
        },
      ];
    } catch (error) {
      handleServiceError('[insights] Failed to detect patterns', error);
    }
  }

  /**
   * Flag anomalies when the latest month deviates strongly from the previous month.
   * @param monthlyTotals - aggregated totals per month
   * @returns - anomaly insights
   */
  detectAnomalies(monthlyTotals: MonthlyTotal[]): Insight[] {
    try {
      if (monthlyTotals.length < 2) return [];
      const [current, previous] = monthlyTotals.slice(0, 2);
      const change = previous.total === 0 ? 0 : (current.total - previous.total) / previous.total;

      if (Math.abs(change) < 0.2) return [];

      return [
        {
          id: crypto.randomUUID(),
          type: 'anomaly',
          title: change > 0 ? 'Dépenses en hausse' : 'Dépenses en baisse',
          detail: `Variation de ${(change * 100).toFixed(1)}% entre ${previous.month} et ${current.month}`,
          severity: Math.abs(change) > 0.35 ? 'high' : 'medium',
          createdAt: new Date().toISOString(),
        },
      ];
    } catch (error) {
      handleServiceError('[insights] Failed to detect anomalies', error);
    }
  }

  /**
   * Generate recommendations leveraging budget usage and recurring costs.
   * @param usage - current budget consumption
   * @param totalFixedCharges - sum of upcoming recurring charges
   * @returns - actionable recommendations
   */
  generateRecommendations(usage: BudgetUsage[], totalFixedCharges: number): Insight[] {
    try {
      const recommendations: Insight[] = [];
      usage.forEach((entry) => {
        if (entry.status === 'warning' || entry.status === 'over') {
          recommendations.push({
            id: crypto.randomUUID(),
            type: 'recommendation',
            title: `Surveillance ${entry.category}`,
            detail: `Vous avez consommé ${entry.spent.toFixed(2)}€ / ${entry.limit.toFixed(2)}€ (${(entry.threshold * 100).toFixed(0)}% seuil)`,
            severity: entry.status === 'over' ? 'high' : 'medium',
            category: entry.category,
            createdAt: new Date().toISOString(),
          });
        }
      });

      if (totalFixedCharges > 0) {
        recommendations.push({
          id: crypto.randomUUID(),
          type: 'recommendation',
          title: 'Charges fixes à venir',
          detail: `${totalFixedCharges.toFixed(2)}€ de charges prévues sur ${RECURRING_LOOKAHEAD_MONTHS} mois`,
          severity: 'low',
          createdAt: new Date().toISOString(),
        });
      }

      return recommendations;
    } catch (error) {
      handleServiceError('[insights] Failed to generate recommendations', error);
    }
  }

  /**
   * Compute trends as insights to feed the dashboard.
   * @param monthlyTotals - aggregated totals
   * @returns - trend insights
   */
  computeTrends(monthlyTotals: MonthlyTotal[]): Insight[] {
    try {
      return monthlyTotals.slice(0, 4).map((entry) => ({
        id: crypto.randomUUID(),
        type: 'trend',
        title: `Total ${entry.month}`,
        detail: `${entry.total.toFixed(2)}€ dépensés`,
        createdAt: new Date().toISOString(),
      }));
    } catch (error) {
      handleServiceError('[insights] Failed to compute trends', error);
    }
  }

  /**
   * Assemble a snapshot consumed by the dashboard UI.
   * @param transactions - scoped transactions
   * @param monthlyTotals - aggregated totals
   * @param usage - budget usage
   * @param projections - budget projections
   * @param totalFixedCharges - upcoming recurring total
   * @returns - dashboard snapshot with insights
   */
  buildSnapshot(
    transactions: Transaction[],
    monthlyTotals: MonthlyTotal[],
    usage: BudgetUsage[],
    projections: BudgetProjection[],
    totalFixedCharges: number,
  ): DashboardSnapshot {
    const patternInsights = this.detectPatterns(transactions);
    const anomalyInsights = this.detectAnomalies(monthlyTotals);
    const recommendationInsights = this.generateRecommendations(usage, totalFixedCharges);
    const trendInsights = this.computeTrends(monthlyTotals);
    const currentMonthTotal = monthlyTotals[0]?.total ?? 0;
    const previousMonthTotal = monthlyTotals[1]?.total ?? 0;
    const monthlyChange = previousMonthTotal === 0 ? 0 : (currentMonthTotal - previousMonthTotal) / previousMonthTotal;

    return {
      transactions,
      monthlyTotals,
      budgetUsage: usage,
      projections,
      insights: [...(patternInsights ?? []), ...(anomalyInsights ?? []), ...(recommendationInsights ?? []), ...(trendInsights ?? [])],
      totalFixedCharges,
      currentMonthTotal,
      previousMonthTotal,
      monthlyChange,
    };
  }
}
