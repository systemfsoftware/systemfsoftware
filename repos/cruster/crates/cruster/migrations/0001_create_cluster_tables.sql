-- Cluster message storage tables for autopilot-cluster.
-- PostgreSQL-specific syntax.

CREATE TABLE IF NOT EXISTS cluster_messages (
    request_id  BIGINT PRIMARY KEY,
    shard_group TEXT NOT NULL,
    shard_id    INT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    tag         TEXT NOT NULL,
    payload     BYTEA NOT NULL DEFAULT '',
    headers     JSONB NOT NULL DEFAULT '{}',
    is_request  BOOLEAN NOT NULL DEFAULT TRUE,
    processed   BOOLEAN NOT NULL DEFAULT FALSE,
    span_id     TEXT,
    trace_id    TEXT,
    sampled     BOOLEAN,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_messages_shard
    ON cluster_messages (shard_group, shard_id, processed);

CREATE TABLE IF NOT EXISTS cluster_replies (
    id          BIGINT PRIMARY KEY,
    request_id  BIGINT NOT NULL REFERENCES cluster_messages(request_id) ON DELETE CASCADE,
    sequence    INT NOT NULL DEFAULT 0,
    payload     BYTEA NOT NULL DEFAULT '',
    is_exit     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_replies_request_id
    ON cluster_replies (request_id);
