import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import { CommandRefused, TaggedCmd } from './Command.schema.js'
import { Decision, DecisionOne, DecisionTwo } from './Decision.schema.js'

/**
 * The canonical construction, and the compile-level proof of the whole unit: the command,
 * decision and error schemas plus a decider either type-check here or the package does not
 * build. The decision variants live in `Decision.schema.ts` and share one family TypeId.
 */
export const acceptTaggedCommand = Workflow.make({
  command: TaggedCmd,
  decision: Decision,
  error: CommandRefused,
  decide: (command: TaggedCmd): Result.Result<DecisionOne | DecisionTwo, CommandRefused> =>
    Match.value(command.value === 0).pipe(
      Match.when(true, () => Result.succeed(new DecisionTwo({ reason: 'zero' }))),
      Match.when(false, () => Result.succeed(new DecisionOne({ value: command.value }))),
      Match.exhaustive,
    ),
})
