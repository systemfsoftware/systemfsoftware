import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import { TaggedCmd } from './Command.schema.js'
import { type Decision as TotalDecision, DecisionOne, DecisionTwo } from './Decision.schema.js'

/**
 * The two outcomes this decider publishes, held as module-scope values because a make body
 * may reference only its own parameters, this module's declarations and the sealed `effect`
 * surface — the decision classes arrive from `Decision.schema.ts`, so the body itself
 * cannot construct them.
 */
const admitted = new DecisionOne({ value: 1 })
const refused = new DecisionTwo({ reason: 'zero' })

export const totalAdmitTaggedCommand = Workflow.total(
  TaggedCmd,
  (command: TaggedCmd): Result.Result<TotalDecision, never> =>
    Match.value(command.value === 0).pipe(
      Match.when(true, () => Result.succeed(refused)),
      Match.when(false, () => Result.succeed(admitted)),
      Match.exhaustive,
    ),
)
