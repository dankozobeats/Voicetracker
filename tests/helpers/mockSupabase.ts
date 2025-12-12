import { vi } from 'vitest';

type TableRow = Record<string, any>;

type DBState = {
  transactions: TableRow[];
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Minimal in-memory Supabase mock to validate business logic without hitting the network.
 * Supports the subset of query methods used in our services.
 */
export function createMockSupabase(initial?: Partial<DBState>) {
  const db: DBState = {
    transactions: [],
    ...initial,
  };

  let idCounter = 1;

  const applyFilters = (rows: TableRow[], filters: ((row: TableRow) => boolean)[]) =>
    filters.reduce((acc, fn) => acc.filter(fn), rows);

  const builderFactory = (table: keyof DBState) => {
    let filters: ((row: TableRow) => boolean)[] = [];
    const materialize = () => applyFilters(db[table], filters);

    const builder: any = {
      get data() {
        return clone(materialize());
      },
      get error() {
        return null;
      },
      select: (_fields?: string) => builder,
      insert: (payload: TableRow | TableRow[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted = rows.map((row) => {
          const id = row.id ?? `id-${idCounter++}`;
          const newRow = { id, ...row };
          db[table].push(newRow);
          return clone(newRow);
        });
        const data = inserted.length === 1 ? inserted[0] : inserted;
        return { data, error: null };
      },
      update: (values: Record<string, unknown>) => {
        const rows = materialize();
        rows.forEach((row) => {
          Object.assign(row, values);
        });
        return {
          data: rows.length === 1 ? clone(rows[0]) : clone(rows),
          error: null,
        };
      },
      delete: () => {
        const rows = db[table];
        const toKeep = rows.filter((row) => !filters.every((fn) => fn(row)));
        db[table].length = 0;
        db[table].push(...toKeep);
        return { error: null, count: rows.length - toKeep.length };
      },
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return builder;
      },
      not: (field: string, _op: string, value: unknown) => {
        // Only supports metadata->>period usage.
        if (field === 'metadata->>period') {
          filters.push((row) => {
            const period = row.metadata?.period;
            return period !== value;
          });
        }
        return builder;
      },
      contains: (field: string | Record<string, unknown>, value?: Record<string, unknown>) => {
        if (typeof field === 'object') {
          value = field;
          field = 'metadata';
        }
        filters.push((row) => {
          const target = row[field as string] || {};
          return Object.entries(value ?? {}).every(([k, v]) => target[k] === v);
        });
        return builder;
      },
      gte: (field: string, value: unknown) => {
        filters.push((row) => new Date(row[field]).getTime() >= new Date(String(value)).getTime());
        return builder;
      },
      lte: (field: string, value: unknown) => {
        filters.push((row) => new Date(row[field]).getTime() <= new Date(String(value)).getTime());
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => {
        const rows = materialize();
        const first = rows[0] ?? null;
        return { data: clone(first), error: null };
      },
      single: () => {
        const rows = materialize();
        const first = rows[0] ?? null;
        return { data: clone(first), error: null };
      },
    };
    return builder;
  };

  const client = {
    from: (table: keyof DBState) => builderFactory(table),
  };

  return { db, client };
}

/**
 * Utilities to mock global modules used by services.
 */
export function mockSupabaseClient(client: any) {
  vi.mock('@/lib/supabase', () => ({
    getServerSupabaseClient: () => client,
  }));
}

export function mockUtils() {
  vi.mock('@/lib/utils', () => ({
    applyUserFilter: (query: any) => query,
    resolveUserId: (id?: string, _opts?: any) => id ?? 'user-1',
    handleServiceError: (_msg: string, err?: unknown) => {
      throw err ?? new Error('service error');
    },
  }));
}

export function mockBudgetLedger() {
  const listForUser = vi.fn(async () => []);
  const matchBudgetForCategory = vi.fn(() => null);
  const syncMasterToSalary = vi.fn(async () => null);
  vi.mock('@/lib/budget', () => ({
    BudgetLedgerService: class {
      listForUser = listForUser;
      matchBudgetForCategory = matchBudgetForCategory;
      syncMasterToSalary = syncMasterToSalary;
    },
    BudgetService: class {},
  }));
  return { listForUser, matchBudgetForCategory, syncMasterToSalary };
}
