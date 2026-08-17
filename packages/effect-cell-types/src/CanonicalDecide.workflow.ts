import * as Result from 'effect/Result'
import * as Workflow from './Workflow.js'

/**
 * The canonical decider. Extracted so `make-file-location` only sees it inside a
 * single-segment `.workflow.ts` file, satisfying the restored taxonomy while
 * preserving the exact phantom-channel contract the `DecidePhase` brand and
 * the interpreter rely on.
 */
export const canonicalDecide = Workflow.make(
  (_decoded: unknown): Result.Result<undefined, Workflow.Tagged> => Result.succeed(undefined),
)
