-- Index for efficient scheduled message queries.
-- The unprocessed_messages query filters on deliver_at for scheduled delivery,
-- and the existing idx_cluster_messages_shard index only covers (shard_group, shard_id, processed).
-- This partial index covers the deliver_at column for unprocessed messages only.

CREATE INDEX IF NOT EXISTS idx_cluster_messages_deliver_at
    ON cluster_messages (shard_group, shard_id, processed, deliver_at)
    WHERE processed = FALSE;
