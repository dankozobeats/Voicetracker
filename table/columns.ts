import { createColumnHelper } from '@tanstack/react-table';

import type { RecurringRule } from '@/models/recurringRule';

const columnHelper = createColumnHelper<RecurringRule>();

const euroFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR').format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
};

const cadenceLabel = (value: RecurringRule['cadence']) => {
  switch (value) {
    case 'weekly':
      return 'Hebdo';
    case 'monthly':
      return 'Mensuel';
    case 'quarterly':
      return 'Trimestriel';
    case 'yearly':
      return 'Annuel';
    default:
      return value;
  }
};

const paymentSourceLabel = (value: RecurringRule['paymentSource']) => {
  const map: Record<string, string> = {
    sg: 'SG',
    floa: 'Floa',
    card: 'Carte',
    carte: 'Carte',
  };
  return map[value] ?? value;
};

export const fixedChargesColumns = [
  columnHelper.accessor('description', {
    header: 'Détails',
    cell: (info) => info.getValue() || '—',
  }),
  columnHelper.accessor('amount', {
    header: 'Montant',
    cell: (info) => euroFormatter.format(info.getValue()),
  }),
  columnHelper.accessor('paymentSource', {
    header: 'Paiement',
    cell: (info) => paymentSourceLabel(info.getValue()),
  }),
  columnHelper.accessor('cadence', {
    header: 'Cadence',
    cell: (info) => cadenceLabel(info.getValue()),
  }),
  columnHelper.accessor('startDate', {
    header: 'Début',
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor('endDate', {
    header: 'Fin',
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor('status', {
    header: 'Statut',
    cell: (info) => (info.getValue() === 'suspended' ? 'suspended' : 'active'),
  }),
];
