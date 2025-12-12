-- ------------------------------------------------------------
-- Migration: budget master auto-sync depuis les revenus salaire
-- Objectif : flag auto_sync_from_salary pour alimenter le master automatiquement
-- ------------------------------------------------------------
BEGIN;

ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS auto_sync_from_salary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN budgets.auto_sync_from_salary IS 'Si true, le budget principal est recalé sur le total des revenus salaire du mois courant';

-- Activer par défaut pour les budgets principaux existants afin de profiter de la synchro.
UPDATE budgets SET auto_sync_from_salary = true WHERE is_master;

COMMIT;
