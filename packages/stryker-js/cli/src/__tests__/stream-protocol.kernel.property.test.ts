import { describe } from '@effect/vitest'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { FastCheck as fc } from 'effect'

import { STREAM_SCHEMA_VERSION, TICK_INTERVAL_MS } from '../stream-protocol.kernel.js'

/**
 * The kernel exports only the two wire constants, so each law is an invariant
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
    ([version]) => /^\d+\.\d+$/.test(version),
  )
})
