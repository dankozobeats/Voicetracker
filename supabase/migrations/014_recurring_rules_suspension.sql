-- Add scheduled suspension metadata to recurring rules.
BEGIN;

ALTER TABLE IF EXISTS recurring_rules
ADD COLUMN IF NOT EXISTS suspended_from timestamptz NULL;

ALTER TABLE IF EXISTS recurring_rules
ADD COLUMN IF NOT EXISTS suspended_until timestamptz NULL;

COMMIT;
