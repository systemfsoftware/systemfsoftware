import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const GzipFailureDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/npm-package/GzipFailureDecision',
)
type GzipFailureDecisionTypeId = typeof GzipFailureDecisionTypeId

export class NotGzipHeader extends Schema.TaggedClass<NotGzipHeader>()('NotGzipHeader', {}) {
  readonly [GzipFailureDecisionTypeId] = GzipFailureDecisionTypeId
}

export class DamagedGzipStream extends Schema.TaggedClass<DamagedGzipStream>()('DamagedGzipStream', {}) {
  readonly [GzipFailureDecisionTypeId] = GzipFailureDecisionTypeId
}

export const GzipFailureDecision = Schema.Union([NotGzipHeader, DamagedGzipStream])
export type GzipFailureDecision = typeof GzipFailureDecision.Type

export class ClassifyGzipFailure extends Schema.TaggedClass<ClassifyGzipFailure>()('ClassifyGzipFailure', {
  code: Schema.NullOr(Schema.Finite),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
