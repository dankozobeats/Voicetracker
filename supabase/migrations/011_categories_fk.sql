-- Restore categories table and enforce FK from transactions.category_id.
begin;

create extension if not exists "pgcrypto";

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'transactions_category_id_fkey'
      and table_name = 'transactions'
  ) then
    alter table transactions
      add constraint transactions_category_id_fkey
      foreign key (category_id)
      references categories(id)
      on delete set null;
  end if;
end $$;

commit;
