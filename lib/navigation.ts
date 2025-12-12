import { Clock, Home, List, Mic, Repeat, Settings, Sparkles, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Centralized navigation map used by side menu, mobile nav, and top bar breadcrumbs.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: Home },
  { id: 'transactions', label: 'Transactions', href: '/transactions', icon: List },
  { id: 'budget', label: 'Budgets', href: '/budgets', icon: Wallet },
  { id: 'deferred', label: 'Paiements différés', href: '/deferred', icon: Clock },
  { id: 'recurring', label: 'Charges fixes', href: '/recurring', icon: Repeat },
  { id: 'insights', label: 'Insights', href: '/insights', icon: Sparkles },
  { id: 'voice', label: 'Enregistrer', href: '/voice', icon: Mic },
  { id: 'settings', label: 'Paramètres', href: '/settings', icon: Settings },
];
