import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CommandRefused, TaggedCmd } from './Command.schema.js'

const FixtureDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-cell-types/tests/TaggedCommand/Decision',
)

export class DecisionOne extends S.TaggedClass<DecisionOne>()('DecisionOne', {
  value: S.Int,
}) {
  readonly [FixtureDecisionTypeId] = FixtureDecisionTypeId
}

export class DecisionTwo extends S.TaggedClass<DecisionTwo>()('DecisionTwo', {
  reason: S.String,
}) {
  readonly [FixtureDecisionTypeId] = FixtureDecisionTypeId
}

export type FixtureDecision = DecisionOne | DecisionTwo

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
  (command: TaggedCmd): Result.Result<FixtureDecision, CommandRefused> =>
    Result.succeed(new DecisionOne({ value: command.value })),
)
