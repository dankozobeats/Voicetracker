import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';

import { fixedChargesColumns } from '@/table/columns';
import type { RecurringRule } from '@/models/recurringRule';

interface FixedChargesTableProps {
  rules: RecurringRule[];
  className?: string;
}

export function FixedChargesTable({ rules, className }: FixedChargesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(() => fixedChargesColumns, []);

  const table = useReactTable({
    data: rules,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableClassNames = ['overflow-hidden', 'rounded-2xl', 'border', 'border-slate-800', 'bg-slate-900/60', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={tableClassNames}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm text-slate-200">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 font-semibold text-slate-200"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted()
                          ? header.column.getIsSorted() === 'asc'
                            ? '▲'
                            : '▼'
                          : ''}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-800">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-slate-400">
                  Aucune charge fixe à afficher pour le moment.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-900/70">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-slate-200">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
