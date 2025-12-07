import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import TransactionTable from '@/components/TransactionTable';
import { TransactionService } from '@/lib/transactions';

// -------------------------------------------
// Page Transactions : charge les données enrichies (catégorie join) côté serveur pour SSR
// -------------------------------------------
export default async function TransactionsPage() {
  // -------------------------------------------
  // Récupère la session pour scoper les données à l'utilisateur connecté
  // -------------------------------------------
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // -------------------------------------------
  // Redirige vers /login si l'utilisateur n'est pas authentifié
  // -------------------------------------------
  if (!session?.user?.id) {
    redirect('/login');
  }

  // -------------------------------------------
  // Utilise le service pour récupérer les transactions avec catégories jointes
  // -------------------------------------------
  const transactionService = new TransactionService();
  const transactions = await transactionService.list({}, session.user.id);

  return (
    <div className="space-y-4 p-6">
      {/* ------------------------------------------- */}
      {/* En-tête sticky : toujours visible pour l'accès rapide au bouton d'ajout */}
      {/* ------------------------------------------- */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-2 py-3 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Transactions</p>
          <h1 className="text-xl font-semibold text-white">Historique</h1>
        </div>
        <Link
          href="/transactions/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
        >
          + Ajouter une transaction
        </Link>
      </div>

      {/* ------------------------------------------- */}
      {/* Tableau interactif (édition/suppression + badges) */}
      {/* ------------------------------------------- */}
      <TransactionTable transactions={transactions} />
    </div>
  );
}
