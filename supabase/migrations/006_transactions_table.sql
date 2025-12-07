-- Create unified transactions table for voice and manual flows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense','transfer')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  category_id uuid,
  description text,
  merchant text,
  date timestamptz NOT NULL,
  ai_confidence numeric(3,2),
  ai_raw text NOT NULL,
  ai_source text NOT NULL DEFAULT 'voice',
  raw_transcription text,
  recurring_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE transactions IS 'Transactions consolidées issues du pipeline vocal et des entrées manuelles';
COMMENT ON COLUMN transactions.ai_raw IS 'Transcription brute retournée par le moteur de reconnaissance vocale';
COMMENT ON COLUMN transactions.metadata IS 'Données IA enrichies (parsing Groq, etc.)';

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
COMMIT;
