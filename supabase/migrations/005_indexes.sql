-- Non-destructive indexes to speed up queries.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budget_rules_user_category ON budget_rules(user_id, category);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_user ON recurring_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
COMMIT;
