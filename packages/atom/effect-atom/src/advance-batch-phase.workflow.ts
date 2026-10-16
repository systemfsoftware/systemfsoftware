import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const BatchStepDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/BatchStepDecision',
)
type BatchStepDecisionTypeId = typeof BatchStepDecisionTypeId

export class RebuildAndNotify extends Schema.TaggedClass<RebuildAndNotify>()('RebuildAndNotify', {}) {
  readonly [BatchStepDecisionTypeId] = BatchStepDecisionTypeId
}

export class ResetBatch extends Schema.TaggedClass<ResetBatch>()('ResetBatch', {}) {
  readonly [BatchStepDecisionTypeId] = BatchStepDecisionTypeId
}

export class StayNested extends Schema.TaggedClass<StayNested>()('StayNested', {}) {
  readonly [BatchStepDecisionTypeId] = BatchStepDecisionTypeId
}

export const BatchStepDecision = Schema.Union([RebuildAndNotify, ResetBatch, StayNested])
export type BatchStepDecision = typeof BatchStepDecision.Type

export const BatchEvent = Schema.Literals(['commit-request', 'finish-request'])
export type BatchEvent = Schema.Schema.Type<typeof BatchEvent>

export class BatchStep extends Schema.TaggedClass<BatchStep>()('BatchStep', {
  depth: Schema.Int,
  event: BatchEvent,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const outermost = (command: BatchStep): boolean => command.depth === 1

const outermostVerdict = (command: BatchStep): BatchStepDecision =>
  Match.value(command.event).pipe(
    Match.when('commit-request', () => RebuildAndNotify.make({})),
    Match.when('finish-request', () => ResetBatch.make({})),
    Match.exhaustive,
  )

export const advanceBatchPhase = Workflow.make({
  command: BatchStep,
  decision: BatchStepDecision,
  error: Schema.Never,
  decide: (command): Result.Result<BatchStepDecision, never> =>
    Result.succeed(
      Match.value(outermost(command)).pipe(
        Match.when(true, () => outermostVerdict(command)),
        Match.when(false, () => StayNested.make({})),
        Match.exhaustive,
      ),
    ),
})
