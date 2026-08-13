-- Drop the text_pattern_ops index on cluster_workflow_journal.
-- The list_keys query was replaced with a range query (WHERE key >= $1 AND key < $2),
-- making the text_pattern_ops index unnecessary. The btree primary key index supports range scans.
DROP INDEX IF EXISTS idx_workflow_journal_prefix;
