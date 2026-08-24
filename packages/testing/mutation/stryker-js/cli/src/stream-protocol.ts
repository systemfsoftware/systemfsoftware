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

/** The version shape the law pins. */
const MAJOR_DOT_MINOR = /^\d+\.\d+$/

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * Only the two wire constants are exported, so each law is an invariant
   * over the single defined value rather than a quantified relation: a value
   * change (a non-positive tick, a version that stops being `N.N`) is exactly
   * the bug these pin.
   */
  describe('stream-protocol wire constants', () => {
    it.prop(
      '∀tick_TickInterval_≡Schedulable',
      [fc.constant(TICK_INTERVAL_MS)],
      ([tick]) => Number.isInteger(tick) && tick > 0,
    )

    it.prop(
      '∀version_SchemaVersion_≡MajorDotMinor',
      [fc.constant(STREAM_SCHEMA_VERSION)],
      ([version]) => MAJOR_DOT_MINOR.test(version),
    )
  })
}
