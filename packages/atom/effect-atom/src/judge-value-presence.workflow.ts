import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { NodePhase } from './node-phase.schema.js'

const ValuePresenceDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/ValuePresenceDecision',
)
type ValuePresenceDecisionTypeId = typeof ValuePresenceDecisionTypeId

export class HoldsValue extends Schema.TaggedClass<HoldsValue>()('HoldsValue', {}) {
  readonly [ValuePresenceDecisionTypeId] = ValuePresenceDecisionTypeId
}

export class HoldsNothing extends Schema.TaggedClass<HoldsNothing>()('HoldsNothing', {}) {
  readonly [ValuePresenceDecisionTypeId] = ValuePresenceDecisionTypeId
}

export const ValuePresenceDecision = Schema.Union([HoldsValue, HoldsNothing])
export type ValuePresenceDecision = typeof ValuePresenceDecision.Type

export class PresenceQuery extends Schema.TaggedClass<PresenceQuery>()('PresenceQuery', {
  phase: NodePhase,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const holdsValue = (command: PresenceQuery): boolean => ['stale', 'checking', 'valid'].includes(command.phase)

export const judgeValuePresence = Workflow.make({
  command: PresenceQuery,
  decision: ValuePresenceDecision,
  error: Schema.Never,
  decide: (command): Result.Result<ValuePresenceDecision, never> =>
    Result.succeed(
      Match.value(holdsValue(command)).pipe(
        Match.when(true, () => HoldsValue.make({})),
        Match.when(false, () => HoldsNothing.make({})),
        Match.exhaustive,
      ),
    ),
})
