-- Add CHECK constraint to prevent negative retry_count values.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'cluster_messages'
          AND constraint_name = 'chk_retry_count'
    ) THEN
        ALTER TABLE cluster_messages
            ADD CONSTRAINT chk_retry_count CHECK (retry_count >= 0);
    END IF;
END $$;
