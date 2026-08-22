import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import { type Admitted, Decoded, type Refused } from './InterpreterDecide.workflow.js'

/**
 * The traced decider. It reuses `Decoded` as its command because the interpreter
 * bag types this phase's decoded member as that class, and `Workflow.make` now
 * derives the command channel from the class it is handed — a zero-argument
 * decider can no longer express a command at all.
 */
export const tracedDecide = (trace: string[]) =>
  Workflow.make(Decoded, (_command: Decoded): Result.Result<Admitted, Refused> => {
    trace.push('decide')
    return Result.succeed({ kind: 'Admitted', length: 0 })
  })
