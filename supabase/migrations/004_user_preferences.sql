-- User preferences to store IA settings and thresholds.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  currency text DEFAULT 'EUR',
  locale text DEFAULT 'fr-FR',
  ai_assistant_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb
);
COMMENT ON TABLE user_preferences IS 'Préférences de personnalisation VoiceTracker';
COMMIT;
