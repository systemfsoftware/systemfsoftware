/**
 * Rejection properties for the port-conflict decision schemas — the
 * `S.Int` refinement on `LaunchRetry.nextAttempt`: an attempt index is a
 * whole number, so a fractional next-attempt is the refusal class.
 *
 * This `refutes` call also discharges the refinement's obligation node for
 * the generated law suite's obligation test, keeping it green (same
 * discipline as the model's `*.property.test.ts` files).
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'

import { LaunchRetry } from '../port-conflict.workflow.js'

refutes(LaunchRetry, {
  FractionalAttempt: fc.constant({ _tag: 'Retry', nextAttempt: 1.5 }),
})
