-- Add CHECK constraint to validate uninterruptible column values.
-- Uses DO block with IF NOT EXISTS pattern for idempotency.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_uninterruptible'
          AND table_name = 'cluster_messages'
    ) THEN
        ALTER TABLE cluster_messages
        ADD CONSTRAINT chk_uninterruptible
        CHECK (uninterruptible IN ('No', 'Client', 'Server', 'Both'));
    END IF;
END
$$;
