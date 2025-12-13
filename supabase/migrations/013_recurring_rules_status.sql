-- Add suspension metadata to recurring rules so charges can be paused.
BEGIN;

ALTER TABLE IF EXISTS recurring_rules
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE IF EXISTS recurring_rules
ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL;

ALTER TABLE IF EXISTS recurring_rules
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE IF EXISTS recurring_rules
ADD CONSTRAINT recurring_rules_status_check CHECK (status IN ('active','suspended'));

ALTER TABLE IF EXISTS recurring_rules
DROP COLUMN IF EXISTS active;

UPDATE recurring_rules
SET status = 'active'
WHERE status IS NULL;

UPDATE recurring_rules
SET suspended_at = NULL
WHERE suspended_at IS NOT NULL AND status = 'active';

COMMIT;
