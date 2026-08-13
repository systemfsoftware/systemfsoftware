-- Add last_read column to cluster_messages for dedup guard.
-- When a message is read by unprocessed_messages, last_read is set to NOW().
-- Subsequent poll cycles skip messages where last_read < guard_interval ago,
-- preventing re-dispatching messages that are still being processed.
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS last_read TIMESTAMPTZ;
