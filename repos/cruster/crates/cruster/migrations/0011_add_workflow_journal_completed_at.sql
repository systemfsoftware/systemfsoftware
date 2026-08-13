-- Add completed_at column for workflow journal cleanup.
-- Set when a workflow completes, enabling TTL-based cleanup of old entries.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cluster_workflow_journal'
        AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE cluster_workflow_journal
        ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_journal_completed_at
ON cluster_workflow_journal (completed_at)
WHERE completed_at IS NOT NULL;
