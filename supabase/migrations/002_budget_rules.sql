-- Budget rules are additive and scoped by user.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS budget_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit > 0),
  alert_threshold numeric(5,2) NOT NULL DEFAULT 0.8 CHECK (alert_threshold >= 0 AND alert_threshold <= 1),
  start_date date NOT NULL DEFAULT now(),
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE budget_rules IS 'Budget plafonds par catégorie';
COMMENT ON COLUMN budget_rules.alert_threshold IS '0-1 ratio pour déclencher les alertes';
COMMIT;
