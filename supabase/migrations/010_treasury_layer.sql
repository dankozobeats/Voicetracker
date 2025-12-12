-- ---------------------------------------------------------------------------
-- Treasury layer: payment sources (SG vs Floa) and repayment metadata.
-- Adds payment_source and floa_repayment to transactions and recurring_rules,
-- reinforces metadata defaults, and documents new AI/raw fields plus budget FK.
-- ---------------------------------------------------------------------------
BEGIN;

-- ---------------------------
-- transactions
-- ---------------------------
-- payment_source (sg | floa) with default sg
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'sg' CHECK (payment_source IN ('sg', 'floa'));
COMMENT ON COLUMN transactions.payment_source IS 'Source de paiement : sg (compte principal) ou floa (paiement différé)';

-- floa_repayment flag
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS floa_repayment boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN transactions.floa_repayment IS 'Indique si la ligne est un remboursement Floa généré automatiquement';

-- metadata default safety (re-assert default + not null)
ALTER TABLE transactions
ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
ALTER COLUMN metadata SET NOT NULL;

-- ai_raw (LLM raw payload) and ai_source (origin)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS ai_raw text,
ADD COLUMN IF NOT EXISTS ai_source text;
COMMENT ON COLUMN transactions.ai_raw IS 'Payload brut renvoyé par le moteur IA';
COMMENT ON COLUMN transactions.ai_source IS 'Origine du traitement IA (ex: voice, import)';

-- raw_transcription storage
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS raw_transcription text;
COMMENT ON COLUMN transactions.raw_transcription IS 'Transcription brute avant parsing';

-- budget FK with ON DELETE SET NULL (idempotent refresh)
DO $$
DECLARE
  constraint_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_budget_id_fkey'
      AND table_name = 'transactions'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_budget_id_fkey;
  END IF;
  ALTER TABLE transactions
    ADD CONSTRAINT transactions_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE SET NULL;
END $$;
COMMENT ON COLUMN transactions.budget_id IS 'Lien vers le budget concerné (nullable, remis à NULL si le budget est supprimé)';

-- ---------------------------
-- recurring_rules
-- ---------------------------
ALTER TABLE recurring_rules
ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'sg' CHECK (payment_source IN ('sg', 'floa'));
COMMENT ON COLUMN recurring_rules.payment_source IS 'Source de paiement par défaut pour la règle (sg ou floa)';

COMMIT;

-- ---------------------------------------------------------------------------
-- Down migration
-- ---------------------------------------------------------------------------
-- Note: drops added columns and recreates budget FK constraint if it existed.
BEGIN;

-- recurring_rules rollback
ALTER TABLE recurring_rules
DROP COLUMN IF EXISTS payment_source;

-- transactions rollback
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_budget_id_fkey;

ALTER TABLE transactions
DROP COLUMN IF EXISTS payment_source,
DROP COLUMN IF EXISTS floa_repayment,
DROP COLUMN IF EXISTS ai_raw,
DROP COLUMN IF EXISTS ai_source,
DROP COLUMN IF EXISTS raw_transcription;

-- metadata default/nonnull reset: best-effort revert to nullable without default
ALTER TABLE transactions
ALTER COLUMN metadata DROP DEFAULT,
ALTER COLUMN metadata DROP NOT NULL;

-- Recreate budget FK without ON DELETE SET NULL (legacy neutral behavior)
DO $$
DECLARE
  has_budgets boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'budgets'
  ) INTO has_budgets;

  IF has_budgets THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budgets(id);
  END IF;
END $$;

COMMIT;
