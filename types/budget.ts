// ------------------------------------------------------------
// Typages pour la gestion des budgets hiérarchiques
// ------------------------------------------------------------
import type { TransactionCategory } from '@/models/transaction';

/**
 * Budget stocké en base (budget principal ou sous-budget).
 */
export interface BudgetEntity {
  id: string;
  userId: string;
  name: string;
  amount: number;
  remaining: number;
  isMaster: boolean;
  autoSyncFromSalary: boolean;
  parentId: string | null;
  category: TransactionCategory | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Données nécessaires pour créer ou mettre à jour un budget.
 */
export interface BudgetPayload {
  name: string;
  amount: number;
  isMaster: boolean;
  parentId?: string | null;
  category?: TransactionCategory | null;
  autoSyncFromSalary?: boolean;
}

/**
 * Budget enrichi pour l'affichage (progression, enfant, montant dépensé).
 */
export interface BudgetWithUsage extends BudgetEntity {
  spent: number;
  progress: number;
  children: BudgetWithUsage[];
}

/**
 * Résumé agrégé pour le tableau de bord.
 */
export interface BudgetDashboard {
  budgets: BudgetWithUsage[];
  master: BudgetWithUsage | null;
}
