-- Ajout des informations de compte et de date d'échéance pour transactions, et direction pour règles récurrentes.
BEGIN;

-- Colonne account pour identifier le compte source (ex: sg-salaire, sg-courant, floa)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS account text;

-- Colonne settlement_date pour gérer les paiements différés (ex: carte Floa)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS settlement_date timestamptz;

-- Direction sur les règles récurrentes pour distinguer revenu (income) vs charge (expense)
ALTER TABLE recurring_rules
ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'expense' CHECK (direction IN ('income', 'expense'));

COMMIT;
