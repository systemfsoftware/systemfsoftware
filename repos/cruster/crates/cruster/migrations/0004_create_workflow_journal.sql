-- Workflow journal for durable idempotency cache.
-- Stores workflow execution results and deferred values.
CREATE TABLE IF NOT EXISTS cluster_workflow_journal (
    key TEXT PRIMARY KEY,
    value BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_journal_prefix ON cluster_workflow_journal (key text_pattern_ops);
