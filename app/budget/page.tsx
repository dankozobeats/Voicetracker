import { redirect } from 'next/navigation';

// Legacy route kept for backward compatibility; redirect to the new budgets page.
export default function BudgetLegacyRedirect() {
  redirect('/budgets');
}
