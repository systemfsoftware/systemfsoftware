-- Add uninterruptible column to cluster_messages.
-- Values: 'No', 'Client', 'Server', 'Both' (matching schema::Uninterruptible enum).
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS uninterruptible TEXT NOT NULL DEFAULT 'No';
