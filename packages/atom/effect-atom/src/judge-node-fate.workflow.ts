import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const NodeFateDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/NodeFateDecision',
)
type NodeFateDecisionTypeId = typeof NodeFateDecisionTypeId

export class KeepNode extends Schema.TaggedClass<KeepNode>()('KeepNode', {}) {
  readonly [NodeFateDecisionTypeId] = NodeFateDecisionTypeId
}

export class DropNode extends Schema.TaggedClass<DropNode>()('DropNode', {}) {
  readonly [NodeFateDecisionTypeId] = NodeFateDecisionTypeId
}

export const NodeFateDecision = Schema.Union([KeepNode, DropNode])
export type NodeFateDecision = typeof NodeFateDecision.Type

export class JudgeNodeFate extends Schema.TaggedClass<JudgeNodeFate>()('JudgeNodeFate', {
  keepAlive: Schema.Boolean,
  hasListeners: Schema.Boolean,
  hasChildren: Schema.Boolean,
  isLive: Schema.Boolean,
  isWaiting: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const pinned = (command: JudgeNodeFate): boolean =>
  [
    command.keepAlive,
    command.hasListeners,
    command.hasChildren,
    command.isLive === false,
    command.isWaiting,
  ].includes(true)

export const judgeNodeFate = Workflow.make({
  command: JudgeNodeFate,
  decision: NodeFateDecision,
  error: Schema.Never,
  decide: (command): Result.Result<NodeFateDecision, never> =>
    Match.value(pinned(command)).pipe(
      Match.when(true, () => Result.succeed(KeepNode.make({}))),
      Match.when(false, () => Result.succeed(DropNode.make({}))),
      Match.exhaustive,
    ),
})
