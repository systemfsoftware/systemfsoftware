-- Add retry_count column to track delivery attempts for persisted messages.
-- Messages exceeding the max retry count are dead-lettered.
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
