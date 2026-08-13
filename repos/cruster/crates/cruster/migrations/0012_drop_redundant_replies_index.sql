-- Drop redundant single-column index on cluster_replies(request_id).
-- The composite indexes from migrations 0009 (UNIQUE request_id, sequence)
-- and 0010 (request_id, is_exit) both serve single-column lookups on request_id.
DROP INDEX IF EXISTS idx_cluster_replies_request_id;
