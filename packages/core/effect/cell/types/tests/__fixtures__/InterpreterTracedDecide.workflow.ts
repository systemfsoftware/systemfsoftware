import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import { Admitted, Decoded, type Malformed, type Rejected } from './InterpreterDecide.workflow.js'

/**
 * The traced decider. It takes the decision as data so the body references only
 * its own parameters (`make-body-purity`), and it passes `Decoded` as the command
 * because `Workflow.make` now derives the command channel from the class it is
 * handed — a zero-argument decider can no longer express a command at all.
 */
export const tracedDecide = (trace: string[], admitted: Admitted) =>
  Workflow.make(Decoded, (_command: Decoded): Result.Result<Admitted | Rejected, Malformed> => {
    trace.push('decide')
    return Result.succeed(admitted)
  })
