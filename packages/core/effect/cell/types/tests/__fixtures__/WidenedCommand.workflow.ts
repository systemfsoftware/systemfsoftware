import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

import { CommandRefused, TaggedCmd } from './Command.schema.js'

/**
 * The no-leak proof. A decider may widen its own parameter to a supertype —
 * ordinary contravariance — and the published command channel must still be the
 * class, not `unknown`. This was the bypass most likely to reopen the original
 * hole, so the type test asserts the resulting channel rather than merely
 * accepting the call.
 */
export const decideWidened = Workflow.make(
  TaggedCmd,
  (_command: unknown): Result.Result<number, CommandRefused> => Result.succeed(0),
)
