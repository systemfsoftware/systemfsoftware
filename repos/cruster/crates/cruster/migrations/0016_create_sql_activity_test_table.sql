-- Migration for SqlActivityTest entity testing
-- Creates a table to test arbitrary SQL execution within activity transactions

CREATE TABLE IF NOT EXISTS sql_activity_test_transfers (
    id BIGSERIAL PRIMARY KEY,
    from_entity TEXT NOT NULL,
    to_entity TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying transfers by source entity
CREATE INDEX IF NOT EXISTS idx_sql_activity_test_transfers_from 
    ON sql_activity_test_transfers (from_entity);
