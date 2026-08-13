-- Tables for durable workflow engine operations.
-- Stores timers (sleep) and deferred values (await_deferred/resolve_deferred).

-- Timers table: stores scheduled wake-up times for durable sleep operations.
-- When a workflow calls sleep(), a timer is created. A background scheduler
-- polls for due timers and notifies waiting workflows.
CREATE TABLE IF NOT EXISTS cluster_workflow_timers (
    -- Composite key: workflow_name + execution_id + timer_name
    workflow_name TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    timer_name TEXT NOT NULL,
    -- When the timer should fire
    fire_at TIMESTAMPTZ NOT NULL,
    -- When the timer was created
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Whether the timer has fired (prevents duplicate processing)
    fired BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (workflow_name, execution_id, timer_name)
);

-- Index for efficiently querying due timers that haven't fired yet
CREATE INDEX IF NOT EXISTS idx_workflow_timers_fire_at
ON cluster_workflow_timers (fire_at)
WHERE NOT fired;

-- Deferred values table: stores signals for await_deferred/resolve_deferred.
-- When a workflow calls await_deferred(), it waits for a matching resolve_deferred().
-- Values are persisted so they survive restarts.
CREATE TABLE IF NOT EXISTS cluster_workflow_deferred (
    -- Composite key: workflow_name + execution_id + deferred_name
    workflow_name TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    deferred_name TEXT NOT NULL,
    -- Serialized value (set by resolve_deferred)
    value BYTEA,
    -- Whether the value has been resolved
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    PRIMARY KEY (workflow_name, execution_id, deferred_name)
);

-- Index for finding unresolved deferred entries (for cleanup)
CREATE INDEX IF NOT EXISTS idx_workflow_deferred_resolved
ON cluster_workflow_deferred (resolved_at)
WHERE resolved;
