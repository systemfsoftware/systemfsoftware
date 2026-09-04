import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { type Admitted, Decoded, type Malformed, type Rejected } from './admit-decoded-command.workflow.js'

/**
 * The traced decider. It takes the decision as data so the body references only
 * its own parameters (`make-body-purity`), and it passes `Decoded` as the command
 * because `Workflow.make` derives the command channel from the class it is
 * handed — a zero-argument decider can no longer express a command at all.
 *
 * The refusal is a Decision the consumer renders (`Rejected` rides the success
 * union); the error channel stays reserved for the malformed abort.
 */
export const admitTracedCommand = (trace: string[], admitted: Admitted, rejected: Rejected) =>
  Workflow.make(Decoded, (command: Decoded): Result.Result<Admitted | Rejected, Malformed> => {
    trace.push('decide')
    return Match.value(command.length > 100).pipe(
      Match.when(true, () => Result.succeed(rejected)),
      Match.when(false, () => Result.succeed(admitted)),
      Match.exhaustive,
    )
  })
