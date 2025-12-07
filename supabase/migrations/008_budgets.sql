-- ------------------------------------------------------------
-- Migration: budgets hiérarchiques + liaison transactions
-- Objectif : budgets parent/enfant + budget_id dans transactions
-- ------------------------------------------------------------
BEGIN;

-- Table budgets : budget principal (is_master=true) et sous-budgets reliés par parent_id
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  remaining numeric(12,2) NOT NULL CHECK (remaining >= 0),
  is_master boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES budgets(id) ON DELETE SET NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un budget principal ne peut pas être enfant
  CHECK ((is_master AND parent_id IS NULL) OR (NOT is_master)),
  -- Les sous-budgets doivent cibler une catégorie
  CHECK ((is_master) OR (category IS NOT NULL)),
  -- Un sous-budget doit pointer vers un parent
  CHECK ((NOT is_master AND parent_id IS NOT NULL) OR is_master)
);

COMMENT ON TABLE budgets IS 'Budgets hiérarchiques (master + sous-budgets) liés aux transactions';
COMMENT ON COLUMN budgets.is_master IS 'Indique si le budget est le budget principal (salaire/global)';
COMMENT ON COLUMN budgets.parent_id IS 'Référence vers le budget parent pour modéliser la hiérarchie';
COMMENT ON COLUMN budgets.category IS 'Catégorie texte utilisée pour auto-lier les transactions';

-- Un seul budget principal par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_master_per_user ON budgets(user_id) WHERE is_master;
-- Index d'accès utilisateur
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

-- Ajout de la FK budget_id sur transactions pour tracer la consommation
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL;
COMMENT ON COLUMN transactions.budget_id IS 'Lien vers le budget utilisé lors de la transaction';

-- RLS budgets : isolation stricte par user_id
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND policyname = 'budgets_select_self'
  ) THEN
    CREATE POLICY budgets_select_self ON budgets
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND policyname = 'budgets_insert_self'
  ) THEN
    CREATE POLICY budgets_insert_self ON budgets
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND policyname = 'budgets_update_self'
  ) THEN
    CREATE POLICY budgets_update_self ON budgets
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND policyname = 'budgets_delete_self'
  ) THEN
    CREATE POLICY budgets_delete_self ON budgets
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- RLS transactions : autoriser uniquement l'accès à ses propres lignes
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_select_self'
  ) THEN
    CREATE POLICY transactions_select_self ON transactions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_insert_self'
  ) THEN
    CREATE POLICY transactions_insert_self ON transactions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_update_self'
  ) THEN
    CREATE POLICY transactions_update_self ON transactions
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions' AND policyname = 'transactions_delete_self'
  ) THEN
    CREATE POLICY transactions_delete_self ON transactions
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

COMMIT;
