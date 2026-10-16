import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { NodePhase } from './node-phase.schema.js'

const NodeReadDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/NodeReadDecision',
)
type NodeReadDecisionTypeId = typeof NodeReadDecisionTypeId

export class SettleChecking extends Schema.TaggedClass<SettleChecking>()('SettleChecking', {}) {
  readonly [NodeReadDecisionTypeId] = NodeReadDecisionTypeId
}

export class RebuildWaiting extends Schema.TaggedClass<RebuildWaiting>()('RebuildWaiting', {}) {
  readonly [NodeReadDecisionTypeId] = NodeReadDecisionTypeId
}

export class KeepValue extends Schema.TaggedClass<KeepValue>()('KeepValue', {}) {
  readonly [NodeReadDecisionTypeId] = NodeReadDecisionTypeId
}

export const NodeReadDecision = Schema.Union([SettleChecking, RebuildWaiting, KeepValue])
export type NodeReadDecision = typeof NodeReadDecision.Type

export class JudgeNodeRead extends Schema.TaggedClass<JudgeNodeRead>()('JudgeNodeRead', {
  phase: NodePhase,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const stillChecking = (command: JudgeNodeRead): boolean => command.phase === 'checking'

const stillWaiting = (command: JudgeNodeRead): boolean => ['uninitialized', 'stale'].includes(command.phase)

const waitingVerdict = (command: JudgeNodeRead): NodeReadDecision =>
  Match.value(stillWaiting(command)).pipe(
    Match.when(true, () => RebuildWaiting.make({})),
    Match.when(false, () => KeepValue.make({})),
    Match.exhaustive,
  )

export const judgeNodeRead = Workflow.make({
  command: JudgeNodeRead,
  decision: NodeReadDecision,
  error: Schema.Never,
  decide: (command): Result.Result<NodeReadDecision, never> =>
    Result.succeed(
      Match.value(stillChecking(command)).pipe(
        Match.when(true, () => SettleChecking.make({})),
        Match.when(false, () => waitingVerdict(command)),
        Match.exhaustive,
      ),
    ),
})
