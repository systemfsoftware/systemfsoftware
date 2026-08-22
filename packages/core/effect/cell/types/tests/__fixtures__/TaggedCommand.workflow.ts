import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

import { CommandRefused, TaggedCmd } from './Command.schema.js'

/**
 * The canonical two-argument construction, and the compile-level proof of the
 * whole unit: a command schema class in argument 0 and a decider in argument 1
 * either type-check here or the package does not build.
 *
 * It lives in a fixture `<stem>.workflow.ts` because `make-file-location` permits
 * a construction only there, one per file, and names this exact home for a
 * workflow only a test uses.
 */
export const decideTagged = Workflow.make(
  TaggedCmd,
  (command: TaggedCmd): Result.Result<number, CommandRefused> => Result.succeed(command.value),
)
