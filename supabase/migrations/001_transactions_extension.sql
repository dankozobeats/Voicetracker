-- Add soft delete support and metadata to expenses without altering existing data.
BEGIN;
ALTER TABLE IF EXISTS expenses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_transcription text;
COMMENT ON COLUMN expenses.deleted_at IS 'Soft delete flag used by TransactionService';
COMMENT ON COLUMN expenses.raw_transcription IS 'Stores original vocal transcription when available';
COMMIT;
