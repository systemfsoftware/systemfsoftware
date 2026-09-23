import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const TruncateCursorDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/TruncateCursorDecision',
)
type TruncateCursorDecisionTypeId = typeof TruncateCursorDecisionTypeId

/**
 * The decision variants are declared here rather than in a sibling `*.schema.ts`:
 * a decision's pure body may import no other module's values (`make-body-purity`),
 * so the workflow owns the decision it constructs. The schema-law generator picks
 * the exported schemas up from this module like any other in `src/`.
 */
export class CursorKept extends Schema.TaggedClass<CursorKept>()('CursorKept', {
  position: Schema.BigInt,
}) {
  readonly [TruncateCursorDecisionTypeId] = TruncateCursorDecisionTypeId
}

export class CursorClamped extends Schema.TaggedClass<CursorClamped>()('CursorClamped', {
  position: Schema.BigInt,
}) {
  readonly [TruncateCursorDecisionTypeId] = TruncateCursorDecisionTypeId
}

export const TruncateCursorDecision = Schema.Union([CursorKept, CursorClamped])
export type TruncateCursorDecision = typeof TruncateCursorDecision.Type

export class PlanTruncateCursor extends Schema.TaggedClass<PlanTruncateCursor>()('PlanTruncateCursor', {
  position: Schema.BigInt,
  length: Schema.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

class CursorBeyondEnd extends Schema.TaggedClass<CursorBeyondEnd>()('CursorBeyondEnd', {}) {}
class CursorWithinEnd extends Schema.TaggedClass<CursorWithinEnd>()('CursorWithinEnd', {}) {}

type TruncateStepOutcome = CursorBeyondEnd | CursorWithinEnd

const classifyCursor = (beyond: boolean): TruncateStepOutcome =>
  Match.value(beyond).pipe(
    Match.when(true, (): TruncateStepOutcome => new CursorBeyondEnd({})),
    Match.when(false, (): TruncateStepOutcome => new CursorWithinEnd({})),
    Match.exhaustive,
  )

export const planTruncateCursor = Workflow.make({
  command: PlanTruncateCursor,
  decision: TruncateCursorDecision,
  error: Schema.Never,
  decide: (command): Result.Result<TruncateCursorDecision, never> => {
    const end = BigInt(command.length)
    return Match.value(classifyCursor(command.position > end)).pipe(
      Match.tag('CursorBeyondEnd', () => Result.succeed(new CursorClamped({ position: end }))),
      Match.tag('CursorWithinEnd', () => Result.succeed(new CursorKept({ position: command.position }))),
      Match.exhaustive,
    )
  },
})
