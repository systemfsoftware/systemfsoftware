import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { type Admitted, Decoded, type Malformed, type Rejected } from './InterpreterDecide.workflow.js'

/**
 * The traced decider. It takes the decision as data so the body references only
 * its own parameters (`make-body-purity`), and it passes `Decoded` as the command
 * because `Workflow.make` now derives the command channel from the class it is
 * handed — a zero-argument decider can no longer express a command at all.
 */
export const tracedDecide = (trace: string[], admitted: Admitted, rejected: Rejected) =>
  Workflow.make(Decoded, (_command: Decoded): Result.Result<Admitted | Rejected, Malformed> => {
    trace.push('decide')
    return Match.value(_command.length === -1).pipe(
      Match.when(true, () => Result.succeed(rejected)),
      Match.when(false, () => Result.succeed(admitted)),
      Match.exhaustive,
    )
  })
