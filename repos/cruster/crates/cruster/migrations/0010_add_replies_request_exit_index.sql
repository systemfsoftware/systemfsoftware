-- Add index on (request_id, is_exit) to optimize reset_shards and dead-letter
-- existence checks which use:
--   EXISTS (SELECT 1 FROM cluster_replies WHERE request_id = ... AND is_exit = TRUE)
CREATE INDEX IF NOT EXISTS idx_cluster_replies_request_exit
    ON cluster_replies (request_id, is_exit);
