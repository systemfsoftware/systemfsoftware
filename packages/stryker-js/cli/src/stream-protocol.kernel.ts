/**
 * The wire protocol constants of the machine-mode NDJSON run-event stream.
 * Domain-blind: the stream adapter frames with them and the transport closes
 * terminal lines with the schema version, so each constant has exactly one
 * declaration and no other module may hard-code it.
 */

/**
 * The stream schema version (R21), carried by the header and the error
 * terminal event. Independent of the report schema version: consumers ignore
 * unknown `kind` values and unknown fields, so a new event type is an
 * additive change.
 */
export const STREAM_SCHEMA_VERSION = '1.0'

/**
 * The heartbeat interval (R19), matching Terraform's `apply_progress`
 * cadence: long enough that a slow phase is not noisy, short enough that a
 * consumer can tell "slow" from "hung" without waiting for a mutant event.
 */
export const TICK_INTERVAL_MS = 10_000
