-- Add unique constraint on (request_id, sequence) to prevent duplicate reply chunks.
-- Uses DO block for idempotency.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_replies_request_sequence'
          AND table_name = 'cluster_replies'
    ) THEN
        ALTER TABLE cluster_replies
            ADD CONSTRAINT uq_replies_request_sequence UNIQUE (request_id, sequence);
    END IF;
END
$$;
