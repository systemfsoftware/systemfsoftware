import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

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

export const ReadSliceDecision = Schema.Union([ReadWhole, ReadPartial, ReadExhausted])
export type ReadSliceDecision = typeof ReadSliceDecision.Type

export class ReadSlice extends Schema.TaggedClass<ReadSlice>()('ReadSlice', {
  bytesRead: Schema.Finite,
  requested: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
