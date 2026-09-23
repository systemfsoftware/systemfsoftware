import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const ReadSliceDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/ReadSliceDecision',
)
type ReadSliceDecisionTypeId = typeof ReadSliceDecisionTypeId

export class ReadWhole extends Schema.TaggedClass<ReadWhole>()('ReadWhole', {}) {
  readonly [ReadSliceDecisionTypeId] = ReadSliceDecisionTypeId
}

export class ReadPartial extends Schema.TaggedClass<ReadPartial>()('ReadPartial', {
  bytesRead: Schema.Finite,
}) {
  readonly [ReadSliceDecisionTypeId] = ReadSliceDecisionTypeId
}

export class ReadExhausted extends Schema.TaggedClass<ReadExhausted>()('ReadExhausted', {}) {
  readonly [ReadSliceDecisionTypeId] = ReadSliceDecisionTypeId
}

export type ReadSliceDecision = ReadWhole | ReadPartial | ReadExhausted

export class ReadSlice extends Schema.TaggedClass<ReadSlice>()('ReadSlice', {
  bytesRead: Schema.Finite,
  requested: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

class ReadExhaustedOutcome extends Schema.TaggedClass<ReadExhaustedOutcome>()('ReadExhaustedOutcome', {}) {}
class ReadWholeOutcome extends Schema.TaggedClass<ReadWholeOutcome>()('ReadWholeOutcome', {}) {}
class ReadPartialOutcome extends Schema.TaggedClass<ReadPartialOutcome>()('ReadPartialOutcome', {}) {}

type ReadStepOutcome = ReadExhaustedOutcome | ReadWholeOutcome | ReadPartialOutcome

const selectNonEmptyRead = (bytesRead: number, requested: number): ReadStepOutcome =>
  Match.value(bytesRead >= requested).pipe(
    Match.when(true, (): ReadStepOutcome => new ReadWholeOutcome({})),
    Match.when(false, (): ReadStepOutcome => new ReadPartialOutcome({})),
    Match.exhaustive,
  )

const classifyRead = (bytesRead: number, requested: number): ReadStepOutcome =>
  Match.value(bytesRead === 0).pipe(
    Match.when(true, (): ReadStepOutcome => new ReadExhaustedOutcome({})),
    Match.when(false, (): ReadStepOutcome => selectNonEmptyRead(bytesRead, requested)),
    Match.exhaustive,
  )

export const planReadSlice = Workflow.total(
  ReadSlice,
  (command): Result.Result<ReadSliceDecision, never> =>
    Match.value(classifyRead(command.bytesRead, command.requested)).pipe(
      Match.tag('ReadExhaustedOutcome', () => Result.succeed(new ReadExhausted())),
      Match.tag('ReadWholeOutcome', () => Result.succeed(new ReadWhole())),
      Match.tag('ReadPartialOutcome', () => Result.succeed(new ReadPartial({ bytesRead: command.bytesRead }))),
      Match.exhaustive,
    ),
)
