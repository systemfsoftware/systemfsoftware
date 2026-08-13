-- Add deliver_at column for scheduled message delivery.
-- Messages with deliver_at in the future are excluded from unprocessed_messages polling.

ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS deliver_at TIMESTAMPTZ;
