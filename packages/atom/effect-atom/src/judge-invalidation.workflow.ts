import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { BatchPhaseName } from './batch-phase.schema.js'

const InvalidationDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/InvalidationDecision',
)
type InvalidationDecisionTypeId = typeof InvalidationDecisionTypeId

export class DeferToBatch
  extends Schema.TaggedClass<DeferToBatch, { readonly brand: unique symbol }>()('DeferToBatch', {})
{
  readonly [InvalidationDecisionTypeId] = InvalidationDecisionTypeId
}

export class SkipLazyChildren
  extends Schema.TaggedClass<SkipLazyChildren, { readonly brand: unique symbol }>()('SkipLazyChildren', {})
{
  readonly [InvalidationDecisionTypeId] = InvalidationDecisionTypeId
}

export class InvalidateValue
  extends Schema.TaggedClass<InvalidateValue, { readonly brand: unique symbol }>()('InvalidateValue', {})
{
  readonly [InvalidationDecisionTypeId] = InvalidationDecisionTypeId
}

export const InvalidationDecision = Schema.Union([DeferToBatch, SkipLazyChildren, InvalidateValue])
export type InvalidationDecision = typeof InvalidationDecision.Type

export class JudgeInvalidation
  extends Schema.TaggedClass<JudgeInvalidation, { readonly brand: unique symbol }>()('JudgeInvalidation', {
    batchPhase: BatchPhaseName,
    lazy: Schema.Boolean,
    hasListeners: Schema.Boolean,
    childrenActive: Schema.Boolean,
  })
{
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const insideCollect = (command: JudgeInvalidation): boolean => command.batchPhase === 'collect'

const skipsLazy = (command: JudgeInvalidation): boolean =>
  ![
    command.lazy,
    command.hasListeners === false,
    command.childrenActive === false,
  ].includes(false)

const outsideCollectVerdict = (command: JudgeInvalidation): InvalidationDecision =>
  Match.value(skipsLazy(command)).pipe(
    Match.when(true, () => SkipLazyChildren.make({})),
    Match.when(false, () => InvalidateValue.make({})),
    Match.exhaustive,
  )

export const judgeInvalidation = Workflow.make({
  command: JudgeInvalidation,
  decision: InvalidationDecision,
  error: Schema.Never,
  decide: (command): Result.Result<InvalidationDecision, never> =>
    Result.succeed(
      Match.value(insideCollect(command)).pipe(
        Match.when(true, () => DeferToBatch.make({})),
        Match.when(false, () => outsideCollectVerdict(command)),
        Match.exhaustive,
      ),
    ),
})
