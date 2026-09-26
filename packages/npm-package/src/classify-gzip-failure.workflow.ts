import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

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

const fflateInvalidHeaderCode = 6

export const classifyGzipFailure = Workflow.make({
  command: ClassifyGzipFailure,
  decision: GzipFailureDecision,
  error: Schema.Never,
  decide: (command): Result.Result<GzipFailureDecision, never> =>
    Result.succeed(
      Match.value(command.code === fflateInvalidHeaderCode).pipe(
        Match.when(true, () => new NotGzipHeader({})),
        Match.when(false, () => new DamagedGzipStream({})),
        Match.exhaustive,
      ),
    ),
})
