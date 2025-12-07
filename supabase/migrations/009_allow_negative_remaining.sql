-- ------------------------------------------------------------
-- Migration: autoriser remaining négatif sur budgets
-- Objectif : lever la contrainte CHECK (remaining >= 0) pour permettre le découvert
-- ------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.budgets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%remaining >= 0%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.budgets DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

COMMIT;
