-- Recurring charges rules, additive only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL,
  description text,
  cadence text NOT NULL CHECK (cadence IN ('weekly','monthly','quarterly','yearly')),
  day_of_month int,
  weekday int,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE recurring_rules IS 'Charges fixes récurrentes';
COMMIT;
