import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const IdleRemainingDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/IdleRemainingDecision',
)
type IdleRemainingDecisionTypeId = typeof IdleRemainingDecisionTypeId

export class EvictDue extends Schema.TaggedClass<EvictDue>()('EvictDue', {}) {
  readonly [IdleRemainingDecisionTypeId] = IdleRemainingDecisionTypeId
}

export class StillIdle extends Schema.TaggedClass<StillIdle>()('StillIdle', {
  millis: Schema.Finite,
}) {
  readonly [IdleRemainingDecisionTypeId] = IdleRemainingDecisionTypeId
}

export const IdleRemainingDecision = Schema.Union([EvictDue, StillIdle])
export type IdleRemainingDecision = typeof IdleRemainingDecision.Type

export class IdleRemaining extends Schema.TaggedClass<IdleRemaining>()('IdleRemaining', {
  nodeIdleTtl: Schema.Finite,
  elapsedTtl: Schema.Finite,
  swept: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const remainingAfterSweep = (command: IdleRemaining): number => command.nodeIdleTtl - command.elapsedTtl

const remaining = (command: IdleRemaining): number =>
  Match.value(command.swept).pipe(
    Match.when(true, () => remainingAfterSweep(command)),
    Match.when(false, () => command.nodeIdleTtl),
    Match.exhaustive,
  )

const expired = (command: IdleRemaining): boolean => remaining(command) <= 0

export const judgeIdleRemaining = Workflow.make({
  command: IdleRemaining,
  decision: IdleRemainingDecision,
  error: Schema.Never,
  decide: (command): Result.Result<IdleRemainingDecision, never> =>
    Result.succeed(
      Match.value(expired(command)).pipe(
        Match.when(true, () => EvictDue.make({})),
        Match.when(false, () => StillIdle.make({ millis: remaining(command) })),
        Match.exhaustive,
      ),
    ),
})
